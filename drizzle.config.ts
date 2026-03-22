import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/DB/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
