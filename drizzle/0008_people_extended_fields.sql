-- Migration: Add extended fields to people table
-- Tipo, empresa, endereço estruturado e dados bancários

ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "tipo" jsonb DEFAULT '[]';
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "razao_social" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "inscricao_estadual" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "tipo_documento" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "numero_documento" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "cep" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "logradouro" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "endereco_numero" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "complemento" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "bairro" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "cidade" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "estado" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "banco" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "agencia" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "conta" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "tipo_conta" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "titular_conta" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "cpf_cnpj_conta" text;
