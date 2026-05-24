/**
 * Seed do plano de contas (centro de custo) global.
 *
 * Lê `src/DB/seed/plano-contas.csv` (~370 contas) e popula a tabela `plano_contas`.
 * Idempotente: usa ON CONFLICT (numero) DO UPDATE.
 *
 * Roda uma vez por ambiente (ou quando o CSV mudar):
 *   tsx src/DB/seed/seedPlanoContas.ts
 *
 * Estratégia em 3 passes:
 *   1. INSERT/UPSERT todas as contas com numeroPaiId=null (resolve só nome+nivel).
 *   2. UPDATE numeroPaiId pelo lookup do "X.Y.Z → X.Y" (não pelo nome do pai —
 *      nomes como "Defensivos" e "Corretivos e Fertilizantes" repetem em culturas).
 *   3. UPDATE is_folha=true para contas que NÃO aparecem como pai de nenhuma outra.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

import { db, planoContas } from '../index.js';
import { eq, sql } from 'drizzle-orm';

interface ContaCsv {
  numero: string;
  nome: string;
  perfilDesembolso: string | null;
  areasNegocio: string[] | null;
  nivel: number;
}

/**
 * Parser CSV simples: delimitador `;`, valores podem estar entre aspas duplas.
 * Lida com aspas escapadas ("") dentro de campos quoted.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseAreas(s: string): string[] | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s*\+\s*/).map((a) => a.trim()).filter(Boolean);
}

function paiNumero(numero: string): string | null {
  const idx = numero.lastIndexOf('.');
  if (idx === -1) return null;
  return numero.substring(0, idx);
}

function readCsv(): ContaCsv[] {
  const csvPath = path.resolve('src/DB/seed/plano-contas.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Pula header
  const dataLines = lines.slice(1);

  const contas: ContaCsv[] = [];
  const numerosVistos = new Set<string>();

  for (const line of dataLines) {
    const cols = parseCsvLine(line);
    // [Nº, Nome, Pai, Perfil, Áreas, Situação]
    const [numero, nome, , perfil, areas, situacao] = cols;
    if (!numero?.trim() || !nome?.trim()) continue;
    if (situacao?.trim() !== 'Ativo') continue;

    const numeroLimpo = numero.trim();
    if (numerosVistos.has(numeroLimpo)) {
      // CSV original tem 2.7.11 duplicado — última ocorrência ganha.
      console.warn(`[seedPlanoContas] número duplicado no CSV: ${numeroLimpo} — ignorando duplicata`);
      continue;
    }
    numerosVistos.add(numeroLimpo);

    contas.push({
      numero: numeroLimpo,
      nome: nome.trim(),
      perfilDesembolso: perfil?.trim() || null,
      areasNegocio: parseAreas(areas ?? ''),
      nivel: numeroLimpo.split('.').length,
    });
  }

  return contas;
}

async function main() {
  const contas = readCsv();
  console.log(`[seedPlanoContas] CSV parseado: ${contas.length} contas ativas`);

  // Pass 1: upsert todas com numeroPaiId=null. nivel/isFolha preliminares.
  console.log('[seedPlanoContas] pass 1/3: upsert sem hierarquia…');
  for (const c of contas) {
    await db
      .insert(planoContas)
      .values({
        numero: c.numero,
        nome: c.nome,
        numeroPaiId: null,
        perfilDesembolso: c.perfilDesembolso,
        areasNegocio: c.areasNegocio,
        nivel: c.nivel,
        isFolha: false,
        ativo: true,
      })
      .onConflictDoUpdate({
        target: planoContas.numero,
        set: {
          nome: c.nome,
          perfilDesembolso: c.perfilDesembolso,
          areasNegocio: c.areasNegocio,
          nivel: c.nivel,
          // numeroPaiId será atualizado no pass 2
          updatedAt: new Date(),
        },
      });
  }

  // Pass 2: resolver numeroPaiId por lookup de "numero do pai" (X.Y.Z → X.Y).
  console.log('[seedPlanoContas] pass 2/3: resolvendo hierarquia…');
  // Lê todos os IDs de uma vez para evitar 370 round-trips.
  const todas = await db
    .select({ id: planoContas.id, numero: planoContas.numero })
    .from(planoContas);
  const idByNumero = new Map<string, string>();
  for (const r of todas) idByNumero.set(r.numero, r.id);

  let resolvidos = 0;
  let raizes = 0;
  for (const c of contas) {
    const pNumero = paiNumero(c.numero);
    if (!pNumero) {
      // Conta-raiz: garantir numeroPaiId=null.
      await db
        .update(planoContas)
        .set({ numeroPaiId: null })
        .where(eq(planoContas.numero, c.numero));
      raizes++;
      continue;
    }
    const paiId = idByNumero.get(pNumero);
    if (!paiId) {
      console.warn(`[seedPlanoContas] pai não encontrado para ${c.numero} (esperado ${pNumero})`);
      continue;
    }
    await db
      .update(planoContas)
      .set({ numeroPaiId: paiId })
      .where(eq(planoContas.numero, c.numero));
    resolvidos++;
  }
  console.log(`[seedPlanoContas]   ${raizes} raízes + ${resolvidos} hierárquicas resolvidas`);

  // Pass 3: marcar is_folha=true em contas que não são pai de ninguém.
  console.log('[seedPlanoContas] pass 3/3: calculando is_folha…');
  // CTE: ids que aparecem como numero_pai_id em alguma linha.
  await db.execute(sql`
    UPDATE plano_contas
    SET is_folha = NOT EXISTS (
      SELECT 1 FROM plano_contas AS filhos
      WHERE filhos.numero_pai_id = plano_contas.id
    ),
    updated_at = NOW()
  `);

  console.log(`[seedPlanoContas] concluído: ${contas.length} contas processadas.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seedPlanoContas] erro:', err);
  process.exit(1);
});
