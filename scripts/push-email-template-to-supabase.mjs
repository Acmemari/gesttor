#!/usr/bin/env node
/**
 * Envia o template de email de recuperação de senha para o Supabase (projeto hospedado).
 * Requer: SUPABASE_ACCESS_TOKEN no .env ou .env.local (ou variável de ambiente)
 * Token em: https://supabase.com/dashboard/account/tokens
 *
 * Uso: npm run email:push-template
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import dotenv from 'dotenv';

// Carrega .env.local e .env (o script roda da raiz do projeto)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env.local'))) dotenv.config({ path: join(root, '.env.local') });
dotenv.config({ path: join(root, '.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'gtfjaggtgyoldovcmyqh';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Erro: Defina SUPABASE_ACCESS_TOKEN');
  console.error('Obtenha em: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const templatePath = join(__dirname, '../lib/email-templates/reset-password.html');
const templateHtml = readFileSync(templatePath, 'utf-8');

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const body = {
  mailer_subjects_recovery: 'Redefinir Senha - Gesttor',
  mailer_templates_recovery_content: templateHtml,
};

try {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase API ${res.status}: ${err}`);
  }

  console.log('✓ Template de recuperação de senha atualizado no Supabase.');
} catch (e) {
  console.error('Erro:', e.message);
  process.exit(1);
}
