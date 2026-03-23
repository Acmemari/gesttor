/**
 * Migration: cria as tabelas de suporte se não existirem
 * Uso: npx tsx scripts/migrate-support-tickets.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { Pool } from 'pg';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL,
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  current_url TEXT,
  location_area TEXT,
  specific_screen TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by      ON support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status          ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at ON support_tickets(last_message_at);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
  author_type TEXT NOT NULL DEFAULT 'user',
  message     TEXT NOT NULL,
  reply_to_id UUID,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS support_ticket_reads (
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS support_ticket_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  message_id   UUID REFERENCES support_ticket_messages(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  file_size    INTEGER NOT NULL,
  created_by   TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_ticket_id ON support_ticket_attachments(ticket_id);
`;

async function run() {
  const client = await pool.connect();
  try {
    await client.query(SQL);
    console.log('✓ Tabelas de suporte criadas com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('✗ Erro na migração:', err.message);
  process.exit(1);
});
