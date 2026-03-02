/**
 * Storage endpoint — generates presigned URLs and handles server-side deletes.
 * POST /api/storage
 *
 * Actions:
 *   presign-upload  → returns a presigned PUT URL for direct browser→B2 upload
 *   delete          → deletes one or more objects from B2
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let _client: S3Client | null = null;

function getB2Client(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.VITE_B2_ENDPOINT;
  const region = process.env.VITE_B2_REGION;
  const keyId = process.env.VITE_B2_KEY_ID;
  const appKey = process.env.VITE_B2_APP_KEY;

  if (!endpoint || !region || !keyId || !appKey) {
    throw new Error('B2 environment variables are not configured on the server');
  }

  _client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
    forcePathStyle: true,
  });
  return _client;
}

function getBucket(): string {
  const bucket = process.env.VITE_B2_BUCKET;
  if (!bucket) throw new Error('VITE_B2_BUCKET not configured');
  return bucket;
}

/** Allowed origins for CORS. Env var extends project defaults. */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://pecuaria.ai',
  'https://www.pecuaria.ai',
] as const;

const CONFIGURED_ALLOWED_ORIGINS =
  process.env.STORAGE_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];

const ALLOWED_ORIGINS: readonly string[] = Array.from(
  new Set([...DEFAULT_ALLOWED_ORIGINS, ...CONFIGURED_ALLOWED_ORIGINS]),
);

function setCorsIfAllowed(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // No origin: allow (server-to-server, same-origin)
  if (!ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({
      error: `Origin not allowed. Add your frontend URL to STORAGE_ALLOWED_ORIGINS env var (rejected: ${origin})`,
    });
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!setCorsIfAllowed(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, key, keys, contentType, expiresIn } = req.body ?? {};

  try {
    if (action === 'presign-upload') {
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Missing required field: key' });
      }

      const command = new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      });

      const url = await getSignedUrl(getB2Client(), command, {
        expiresIn: expiresIn || 3600,
      });

      return res.status(200).json({ url });
    }

    if (action === 'delete') {
      let deleteKeys: string[];
      if (Array.isArray(keys)) {
        if (!keys.every((k) => typeof k === 'string')) {
          return res.status(400).json({ error: 'All keys must be strings' });
        }
        deleteKeys = keys;
      } else if (key !== undefined && key !== null) {
        if (typeof key !== 'string') {
          return res.status(400).json({ error: 'key must be a string' });
        }
        deleteKeys = [key];
      } else {
        return res.status(400).json({ error: 'Missing required field: key or keys' });
      }

      const client = getB2Client();
      const bucket = getBucket();

      await Promise.all(
        deleteKeys.map((k: string) =>
          client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })),
        ),
      );

      return res.status(200).json({ ok: true, deleted: deleteKeys.length });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal storage error';
    console.error('[api/storage]', action, message);
    return res.status(500).json({ error: message });
  }
}
