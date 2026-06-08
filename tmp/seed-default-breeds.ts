import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Mesma lista de DEFAULT_ANIMAL_BREEDS (src/DB/repositories/animal-breeds.ts). */
const DEFAULT_ANIMAL_BREEDS: { nome: string; codigoAsbia: string }[] = [
  { nome: 'Africander', codigoAsbia: 'AN' },
  { nome: 'Aberdeen Angus', codigoAsbia: 'AN' },
  { nome: 'Red Angus', codigoAsbia: 'AR' },
  { nome: 'Belgian Blue', codigoAsbia: 'BB' },
  { nome: "Blonde D'Aquitaine", codigoAsbia: 'BD' },
  { nome: 'Brangus', codigoAsbia: 'BN' },
  { nome: 'Braford', codigoAsbia: 'BO' },
  { nome: 'Brahman', codigoAsbia: 'BR' },
  { nome: 'Chianina', codigoAsbia: 'CA' },
  { nome: 'Canchim', codigoAsbia: 'CC' },
  { nome: 'Charolês', codigoAsbia: 'CH' },
  { nome: 'Devon', codigoAsbia: 'DE' },
  { nome: 'South Devon', codigoAsbia: 'DS' },
  { nome: 'Guzerá', codigoAsbia: 'GZ' },
  { nome: 'Hereford', codigoAsbia: 'HH' },
  { nome: 'Holandês', codigoAsbia: 'HO' },
  { nome: 'Limousin', codigoAsbia: 'LM' },
  { nome: 'Marchigiana', codigoAsbia: 'MR' },
  { nome: 'Montana', codigoAsbia: 'MT' },
  { nome: 'Nelore', codigoAsbia: 'NE' },
  { nome: 'Nelore Mocho', codigoAsbia: 'NM' },
  { nome: 'Pardo Suíço', codigoAsbia: 'SB' },
  { nome: 'Pitangueiras', codigoAsbia: 'PT' },
  { nome: 'Red Brangus', codigoAsbia: 'RB' },
  { nome: 'Rubia Gallega', codigoAsbia: 'RG' },
  { nome: 'Red Poll', codigoAsbia: 'RP' },
  { nome: 'Sindi', codigoAsbia: 'SD' },
  { nome: 'Senepol', codigoAsbia: 'SE' },
  { nome: 'Santa Gertrudis', codigoAsbia: 'SG' },
  { nome: 'Simbrasil', codigoAsbia: 'SI' },
  { nome: 'Simental', codigoAsbia: 'SM' },
  { nome: 'Shorthorn', codigoAsbia: 'SS' },
  { nome: 'Tabapuã', codigoAsbia: 'TB' },
  { nome: 'Texas Longhorn', codigoAsbia: 'TL' },
  { nome: 'Wagyu/Kobe', codigoAsbia: 'BB' },
];

async function main() {
  const { rows: orgs } = await pool.query<{ id: string }>('SELECT id FROM organizations');
  console.log(`Organizações encontradas: ${orgs.length}`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const org of orgs) {
    const { rows: existing } = await pool.query<{ id: string; nome: string; ordem: number }>(
      'SELECT id, nome, ordem FROM animal_breeds WHERE organization_id = $1',
      [org.id],
    );
    const byName = new Map(existing.map((b) => [b.nome.trim().toLowerCase(), b]));
    let nextOrdem = existing.reduce((mx, b) => Math.max(mx, b.ordem), -1) + 1;

    for (const def of DEFAULT_ANIMAL_BREEDS) {
      const key = def.nome.trim().toLowerCase();
      const match = byName.get(key);
      if (match) {
        // Converte a raça existente de mesmo nome em raça padrão do sistema.
        await pool.query(
          `UPDATE animal_breeds
              SET sistema = true, codigo_asbia = $2, updated_at = now()
            WHERE id = $1`,
          [match.id, def.codigoAsbia],
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO animal_breeds (organization_id, nome, codigo_asbia, sistema, ativo, ordem)
           VALUES ($1, $2, $3, true, true, $4)`,
          [org.id, def.nome, def.codigoAsbia, nextOrdem++],
        );
        totalInserted++;
      }
    }
  }

  console.log(`OK — inseridas: ${totalInserted}, convertidas (já existiam): ${totalUpdated}`);
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
