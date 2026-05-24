/**
 * Aplica a migração 0007 (tabelas de lançamentos) no banco.
 * Uso: npx tsx src/DB/seed/apply-0007.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pool } from '../index.js';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

async function main() {
  const sqlPath = path.resolve('drizzle/0007_lancamentos_orcamento.sql');
  const raw = fs.readFileSync(sqlPath, 'utf-8');
  const statements = raw
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

  console.log(`[apply-0007] aplicando ${statements.length} statements…`);
  for (const stmt of statements) {
    const preview = stmt.split('\n')[0]?.slice(0, 80) ?? '';
    process.stdout.write(`  → ${preview}… `);
    try {
      await pool.query(stmt);
      console.log('OK');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Constraint duplicada ou índice/coluna existente: continuar.
      if (msg.includes('already exists')) {
        console.log('SKIP (já existe)');
      } else {
        console.log('FAIL');
        console.error(msg);
        process.exit(1);
      }
    }
  }
  // Data migration: cria 1 lançamento shadow por linha existente em itens_orcamento.
  // Idempotente: ON CONFLICT no índice parcial lancamentos_shadow_uidx faz NOTHING.
  console.log('\n[apply-0007] migrando itens_orcamento existentes para lancamentos shadow…');
  const result = await pool.query(`
    INSERT INTO lancamentos_orcamento (
      versao_id, farm_id, plano_conta_id,
      recorrencia, valor_base, distribuicao_mensal,
      tipo_origem, descricao, status,
      criado_por, atualizado_por
    )
    SELECT
      i.versao_id,
      i.farm_id,
      i.plano_conta_id,
      'mensal',
      0,
      i.valores_mensais,
      'planilha',
      'Lançamento da planilha',
      'ativo',
      COALESCE(i.atualizado_por, v.criado_por),
      i.atualizado_por
    FROM itens_orcamento i
    JOIN orcamento_versoes v ON v.id = i.versao_id
    ON CONFLICT (versao_id, farm_id, plano_conta_id)
      WHERE tipo_origem = 'planilha'
      DO NOTHING
  `);
  console.log(`  → ${result.rowCount} shadow lançamento(s) criado(s).`);

  console.log('\n[apply-0007] concluído.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
