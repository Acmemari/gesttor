/**
 * Backblaze B2 Storage abstraction layer (S3-compatible).
 *
 * Uploads and deletes go through /api/storage (server-side presigned URLs)
 * to avoid CORS issues with browser-to-B2 requests.
 *
 * Signed URL generation and public URL building remain client-side
 * (they don't make network requests to B2).
 *
 * Prefixes (map to old Supabase buckets):
 *   client-documents/
 *   support-ticket-attachments/
 *   milestone-evidence/
 *   people-photos/
 *   public/
 */
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from './env';
import { getAuthHeaders } from './session';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const env = getEnv();
  _client = new S3Client({
    endpoint: env.VITE_B2_ENDPOINT,
    region: env.VITE_B2_REGION,
    credentials: {
      accessKeyId: env.VITE_B2_KEY_ID,
      secretAccessKey: env.VITE_B2_APP_KEY,
    },
    forcePathStyle: true,
  });
  return _client;
}

function getBucket(): string {
  return getEnv().VITE_B2_BUCKET;
}

function fullKey(prefix: string, path: string): string {
  return `${prefix}/${path}`;
}

/** Retrieves the current Supabase session token for authenticated API calls. */
const getAuthHeader = getAuthHeaders;

/** In-memory cache for presigned GET URLs to avoid repeated signing for the same object. */
const _resolveUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Upload a file to B2 via server-generated presigned URL.
 * 1. Requests a presigned PUT URL from /api/storage
 * 2. PUTs the file directly to B2 using that URL (no auth headers needed)
 */
export async function storageUpload(
  prefix: string,
  path: string,
  body: File | Blob,
  options?: { contentType?: string; upsert?: boolean },
): Promise<void> {
  const ct = options?.contentType ?? (body instanceof File ? body.type : 'application/octet-stream');

  const authHeader = await getAuthHeader();
  const presignRes = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      action: 'presign-upload',
      key: fullKey(prefix, path),
      contentType: ct,
    }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error(err.error || `Presign request failed (${presignRes.status})`);
  }

  const { url } = await presignRes.json();

  const uploadRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': ct },
    body,
  });

  if (!uploadRes.ok) {
    const hint = uploadRes.status === 0
      ? ' (possível erro de CORS — verifique a configuração do bucket B2)'
      : '';
    throw new Error(`B2 upload failed (${uploadRes.status})${hint}`);
  }
}

/**
 * Generate a time-limited signed URL for private objects.
 * Runs client-side — generates the URL locally without a network request.
 */
export async function storageGetSignedUrl(
  prefix: string,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: fullKey(prefix, path),
  });
  return awsGetSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Build a public URL for an object.
 * Requires the bucket (or prefix) to allow public reads in B2.
 */
export function storageGetPublicUrl(prefix: string, path: string): string {
  const env = getEnv();
  return `${env.VITE_B2_ENDPOINT}/${env.VITE_B2_BUCKET}/${fullKey(prefix, path)}`;
}

/**
 * Convert a stored public URL (from storageGetPublicUrl) into a time-limited
 * signed URL so private-bucket objects can be displayed in the browser.
 * Results are cached in memory for (expiresIn - 60) seconds to avoid
 * redundant signing when multiple components display the same object.
 * Returns the original URL unchanged if it doesn't match the expected pattern.
 */
export async function storageResolveUrl(storedUrl: string, expiresIn = 3600): Promise<string> {
  try {
    // Return cached URL if still valid (with 60s safety margin)
    const cached = _resolveUrlCache.get(storedUrl);
    if (cached && Date.now() < cached.expiresAt) return cached.url;

    const env = getEnv();
    const prefix = `${env.VITE_B2_ENDPOINT}/${env.VITE_B2_BUCKET}/`;
    if (!storedUrl.startsWith(prefix)) return storedUrl;

    const key = storedUrl.slice(prefix.length);
    const command = new GetObjectCommand({ Bucket: env.VITE_B2_BUCKET, Key: key });
    const signed = await awsGetSignedUrl(getClient(), command, { expiresIn });

    _resolveUrlCache.set(storedUrl, {
      url: signed,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    });

    return signed;
  } catch {
    return storedUrl;
  }
}

/**
 * Delete one or more objects from B2 via the server API.
 */
export async function storageRemove(prefix: string, paths: string[]): Promise<void> {
  const keys = paths.map((p) => fullKey(prefix, p));

  const authHeader = await getAuthHeader();
  const res = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ action: 'delete', keys }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Delete request failed (${res.status})`);
  }
}
