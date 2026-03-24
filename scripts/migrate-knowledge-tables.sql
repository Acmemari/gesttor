-- Migration: criar tabelas do RAG (Base de Conhecimento Antonio)
-- Requer a extensão pgvector instalada no banco Neon.
-- Execute: psql $DATABASE_URL -f scripts/migrate-knowledge-tables.sql

-- Extensão vetorial (necessária para knowledge_chunks.embedding)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Coleções de documentos
CREATE TABLE IF NOT EXISTS knowledge_collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Documentos (metadados + status do pipeline)
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  source_type      text NOT NULL,                          -- pdf | docx | txt | md
  storage_key      text,                                   -- chave no Backblaze B2
  file_size_bytes  bigint,
  status           text NOT NULL DEFAULT 'pending',        -- pending | extracting | chunking | embedding | published | error
  error_message    text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  collection_id    uuid REFERENCES knowledge_collections(id) ON DELETE SET NULL,
  uploaded_by      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. Chunks vetorizados (pgvector 1024d — voyage-3-large)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index  int NOT NULL,
  content      text NOT NULL,
  token_count  int,
  metadata     jsonb NOT NULL DEFAULT '{}',
  embedding    vector(1024)
);

-- Índice HNSW para busca por similaridade cosine (rápido para top-k queries)
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- 4. Jobs de ingestão (progresso e rastreamento de erros)
CREATE TABLE IF NOT EXISTS knowledge_ingestion_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'running',   -- running | completed | failed
  step                  text,                              -- extract | chunk | embed | publish
  chunks_total          int,
  chunks_done           int NOT NULL DEFAULT 0,
  embedding_tokens_used int NOT NULL DEFAULT 0,
  error_message         text,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 5. Logs de queries RAG
CREATE TABLE IF NOT EXISTS knowledge_retrieval_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question         text NOT NULL,
  chunks_retrieved jsonb,                                  -- [{chunkId, score, documentTitle}]
  answer           text,
  model            text,
  tokens_used      int,
  latency_ms       int,
  user_id          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 6. Feedback dos usuários sobre respostas
CREATE TABLE IF NOT EXISTS knowledge_feedback (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_log_id  uuid NOT NULL REFERENCES knowledge_retrieval_logs(id) ON DELETE CASCADE,
  rating            int CHECK (rating BETWEEN 1 AND 5),
  comment           text,
  user_id           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
