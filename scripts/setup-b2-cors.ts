/**
 * Configura regras CORS no bucket Backblaze B2 via API nativa do B2.
 * Execute com: npx tsx scripts/setup-b2-cors.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

const keyId = process.env.VITE_B2_KEY_ID!;
const appKey = process.env.VITE_B2_APP_KEY!;
const bucket = process.env.VITE_B2_BUCKET!;

if (!keyId || !appKey || !bucket) {
  console.error('Erro: VITE_B2_KEY_ID, VITE_B2_APP_KEY e VITE_B2_BUCKET são obrigatórios');
  process.exit(1);
}

const corsRules = [
  {
    corsRuleName: 'gesttor-upload',
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'https://gesttor.ai',
      'https://www.gesttor.ai',
      'https://gesttor.app',
      'https://www.gesttor.app',
      'https://pecuaria.ai',
      'https://www.pecuaria.ai',
    ],
    allowedOperations: ['s3_put', 's3_get', 's3_head'],
    allowedHeaders: ['*'],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  // 1. Autenticar
  console.log('Autenticando no Backblaze B2...');
  const authToken = Buffer.from(`${keyId}:${appKey}`).toString('base64');
  const authRes = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: `Basic ${authToken}` },
  });

  if (!authRes.ok) {
    const body = await authRes.text();
    throw new Error(`Autenticação falhou (${authRes.status}): ${body}`);
  }

  const auth = await authRes.json() as {
    authorizationToken: string;
    apiUrl?: string;
    apiInfo?: { storageApi: { apiUrl: string } };
    accountId: string;
  };

  const apiUrl = auth.apiUrl ?? auth.apiInfo?.storageApi?.apiUrl;
  if (!apiUrl) throw new Error('apiUrl não encontrado na resposta de autenticação');

  console.log(`Autenticado. Account ID: ${auth.accountId}, API URL: ${apiUrl}`);

  // 2. Listar buckets para obter o bucketId
  const listRes = await fetch(`${apiUrl}/b2api/v3/b2_list_buckets`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId: auth.accountId, bucketName: bucket }),
  });

  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`Listagem de buckets falhou (${listRes.status}): ${body}`);
  }

  const listData = await listRes.json() as { buckets: Array<{ bucketId: string; bucketName: string }> };
  const found = listData.buckets.find((b) => b.bucketName === bucket);
  if (!found) throw new Error(`Bucket "${bucket}" não encontrado`);

  console.log(`Bucket encontrado: ${found.bucketName} (${found.bucketId})`);

  // 3. Atualizar CORS no bucket
  const updateRes = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId: auth.accountId,
      bucketId: found.bucketId,
      corsRules,
    }),
  });

  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`Atualização de CORS falhou (${updateRes.status}): ${body}`);
  }

  const result = await updateRes.json() as { corsRules: unknown[] };
  console.log('\nCORS configurado com sucesso!');
  console.log('Regras aplicadas:', JSON.stringify(result.corsRules, null, 2));
}

main().catch((err) => {
  console.error('Falha:', err.message ?? err);
  process.exit(1);
});
