/**
 * Seed do catálogo de Espécies Forrageiras a partir de docs/Pastagens/forrageiras (1).csv.
 *
 * - Cadastra nas organizações REAIS (exclui as orgs de teste E2E, cujo nome começa com "Organização ").
 * - Idempotente: pula espécies cujo `nome` já existe na organização.
 * - Parsing determinístico das alturas:
 *     • Contínuo: "(máxima)…(mínima)" → { idealMin, idealMax } (faixa). Textos ("Não recomendado") → vazio.
 *     • Rotacionado/Rotatínuo: "(entrada)…(saída…)" → { entrada, saida } usando o PONTO MÉDIO de cada faixa.
 *       Sem os marcadores (entrada)/(saída) (ex.: "Ramoneio", "Rebaixamento a 40 a 60 cm") → vazio.
 * - O texto integral dos três métodos de pastejo é preservado na `descricao`, junto de características,
 *   gênero e histórico, para que nenhuma orientação textual se perca.
 *
 * Uso:
 *   npx tsx tmp/seed-especies-forrageiras.ts           # grava no banco
 *   npx tsx tmp/seed-especies-forrageiras.ts --dry-run # só imprime o que faria
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_PATH = path.resolve('docs/Pastagens/forrageiras (1).csv');

// ── Tipos ────────────────────────────────────────────────────────────────────
interface AlturasPastejo {
  continuo?: { idealMin?: number | null; idealMax?: number | null };
  rotacionado?: { entrada?: number | null; saida?: number | null };
  rotatinuo?: { entrada?: number | null; saida?: number | null };
}

// ── CSV parser (campos com aspas, vírgulas internas e aspas escapadas "") ───────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── Extração de números (aceita vírgula decimal) ────────────────────────────────
function numbersIn(s: string): number[] {
  const matches = s.match(/\d+(?:[.,]\d+)?/g) || [];
  return matches.map((m) => Number(m.replace(',', '.'))).filter((n) => Number.isFinite(n));
}

/** Ponto médio (min+max)/2 dos números do trecho, arredondado. null se não houver número. */
function midpoint(s: string): number | null {
  const ns = numbersIn(s);
  if (ns.length === 0) return null;
  return Math.round((Math.min(...ns) + Math.max(...ns)) / 2);
}

/** Contínuo: "(máxima)…(mínima)" → faixa idealMin–idealMax. Senão, vazio. */
function parseContinuo(text: string): AlturasPastejo['continuo'] | undefined {
  if (!text.includes('(máxima)') || !text.includes('(mínima)')) return undefined;
  const maxSeg = text.slice(0, text.indexOf('(máxima)'));
  const minSeg = text.slice(text.indexOf('(máxima)'), text.indexOf('(mínima)'));
  const maxNs = numbersIn(maxSeg);
  const minNs = numbersIn(minSeg);
  const idealMax = maxNs.length ? Math.max(...maxNs) : null;
  const idealMin = minNs.length ? Math.min(...minNs) : null;
  if (idealMin == null && idealMax == null) return undefined;
  return { idealMin, idealMax };
}

/** Entrada/saída: "(entrada)…(saída…)" → ponto médio de cada faixa. Senão, vazio. */
function parseEntradaSaida(text: string): { entrada: number | null; saida: number | null } | undefined {
  const iEntrada = text.indexOf('(entrada)');
  const iSaida = text.indexOf('(saída');
  if (iEntrada < 0 || iSaida < 0 || iSaida < iEntrada) return undefined;
  const entradaSeg = text.slice(0, iEntrada);
  const saidaSeg = text.slice(iEntrada, iSaida);
  const entrada = midpoint(entradaSeg);
  const saida = midpoint(saidaSeg);
  if (entrada == null && saida == null) return undefined;
  return { entrada, saida };
}

/** Monta o objeto alturas final (só inclui regimes com dado numérico). */
function buildAlturas(continuoTxt: string, rotTxt: string, rotatTxt: string): AlturasPastejo {
  const out: AlturasPastejo = {};
  const c = parseContinuo(continuoTxt);
  if (c) out.continuo = c;
  const r = parseEntradaSaida(rotTxt);
  if (r) out.rotacionado = r;
  const rt = parseEntradaSaida(rotatTxt);
  if (rt) out.rotatinuo = rt;
  return out;
}

/** Descrição preservando características, gênero, manejo (texto integral) e histórico. */
function buildDescricao(o: {
  genero: string; continuo: string; rotacionado: string; rotatinuo: string;
  caracteristicas: string; historico: string;
}): string {
  const parts: string[] = [];
  if (o.caracteristicas.trim()) parts.push(o.caracteristicas.trim());
  if (o.genero.trim()) parts.push(`Gênero: ${o.genero.trim()}`);
  parts.push(
    '— Manejo de pastejo —\n' +
    `Contínuo: ${o.continuo.trim() || '—'}\n` +
    `Rotacionado: ${o.rotacionado.trim() || '—'}\n` +
    `Rotatínuo: ${o.rotatinuo.trim() || '—'}`,
  );
  if (o.historico.trim()) parts.push(`— Histórico —\n${o.historico.trim()}`);
  return parts.join('\n\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(raw).filter((r) => r.length >= 9 && r[0].trim());
  const header = rows.shift(); // remove cabeçalho
  console.log(`CSV: ${rows.length} espécies lidas (cabeçalho: ${header?.[0]}…)\n`);

  const catalogo = rows.map((r, i) => {
    const [nome, cientifico, genero, pContinuo, pRotacionado, pRotatinuo, _imagem, caracteristicas, historico] = r;
    return {
      ordemCatalogo: i,
      nome: nome.trim(),
      nomeCientifico: cientifico.trim() || null,
      alturas: buildAlturas(pContinuo, pRotacionado, pRotatinuo),
      descricao: buildDescricao({
        genero, continuo: pContinuo, rotacionado: pRotacionado, rotatinuo: pRotatinuo,
        caracteristicas, historico,
      }),
    };
  });

  // Conferência do parsing das alturas
  console.log('── Alturas parseadas ───────────────────────────────────────────');
  for (const e of catalogo) {
    const a = e.alturas;
    const c = a.continuo ? `cont ${a.continuo.idealMin ?? '·'}–${a.continuo.idealMax ?? '·'}` : 'cont —';
    const r = a.rotacionado ? `rot ${a.rotacionado.entrada ?? '·'}→${a.rotacionado.saida ?? '·'}` : 'rot —';
    const rt = a.rotatinuo ? `rotat ${a.rotatinuo.entrada ?? '·'}→${a.rotatinuo.saida ?? '·'}` : 'rotat —';
    console.log(`  ${e.nome.padEnd(34)} | ${c.padEnd(14)} | ${r.padEnd(14)} | ${rt}`);
  }
  console.log('');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Organizações reais (exclui as de teste E2E que começam com "Organização ")
  const orgsRes = await pool.query(
    `SELECT id, name FROM organizations WHERE name NOT ILIKE 'Organização %' ORDER BY name`,
  );
  const orgs = orgsRes.rows as { id: string; name: string }[];
  console.log(`Organizações-alvo (${orgs.length}): ${orgs.map((o) => o.name).join(', ')}\n`);

  if (DRY_RUN) {
    console.log('[DRY-RUN] Nenhuma escrita realizada.');
    console.log('\n── Exemplo de descrição (1ª espécie) ───────────────────────────');
    console.log(catalogo[0].descricao);
    await pool.end();
    return;
  }

  let totalInsert = 0;
  let totalSkip = 0;
  for (const org of orgs) {
    const existing = await pool.query(
      `SELECT nome FROM especies_forrageiras WHERE organization_id = $1`,
      [org.id],
    );
    const have = new Set(existing.rows.map((x: any) => String(x.nome).trim().toLowerCase()));
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX(ordem), -1) AS m FROM especies_forrageiras WHERE organization_id = $1`,
      [org.id],
    );
    let nextOrdem = Number(maxRes.rows[0].m) + 1;

    let ins = 0;
    let skp = 0;
    for (const e of catalogo) {
      if (have.has(e.nome.toLowerCase())) { skp++; continue; }
      await pool.query(
        `INSERT INTO especies_forrageiras
           (organization_id, nome, nome_cientifico, alturas, imagens, descricao, ordem)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, $5, $6)`,
        [org.id, e.nome, e.nomeCientifico, JSON.stringify(e.alturas), e.descricao, nextOrdem++],
      );
      ins++;
    }
    totalInsert += ins;
    totalSkip += skp;
    console.log(`  ${org.name.padEnd(34)} → +${ins} inseridas, ${skp} já existiam`);
  }

  console.log(`\n✓ Concluído: ${totalInsert} inserções no total (${totalSkip} puladas).`);
  await pool.end();
}

main().catch((err) => { console.error('ERRO:', err); process.exit(1); });
