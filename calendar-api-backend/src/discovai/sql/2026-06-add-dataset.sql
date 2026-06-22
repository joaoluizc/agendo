-- DiscovAI: add multi-dataset support + dataset-filtered match_embeddings.
--
-- Applied to the Supabase project on 2026-06-22 to fix a PGRST202 error: the
-- deployed match_embeddings was the original 3-arg version, but
-- src/discovai/discovaiService.js calls it with a 4th `filter_dataset` arg.
--
-- Ported from DiscovAI-search/src/db/migrations/2026-06-add-dataset.sql, with
-- one change: `sac.article_id::text` is cast explicitly so CREATE FUNCTION
-- succeeds whether the deployed support_article_chunks.article_id column is
-- uuid or text (the RETURNS TABLE declares it text).
--
-- Run once in the Supabase SQL editor (needs DDL privileges; the anon key
-- can't apply DDL). Idempotent & backward-compatible: existing rows backfill
-- to dataset='duda' via the column DEFAULT, and the new filter_dataset param
-- defaults to NULL so any existing 3-arg caller keeps working unchanged.

-- 1. Partition column on both tables (existing rows backfilled to 'duda').
ALTER TABLE support_articles
  ADD COLUMN IF NOT EXISTS dataset text NOT NULL DEFAULT 'duda';
ALTER TABLE support_article_chunks
  ADD COLUMN IF NOT EXISTS dataset text NOT NULL DEFAULT 'duda';

-- 2. Index the filter column on chunks (the RPC filters here).
CREATE INDEX IF NOT EXISTS support_article_chunks_dataset_idx
  ON support_article_chunks (dataset);

-- 3. Replace the 3-arg RPC with a 4-arg version that has an optional dataset filter.
--    Adding a parameter changes the signature, so drop the old 3-arg version first.
DROP FUNCTION IF EXISTS match_embeddings(vector, float, int);

CREATE OR REPLACE FUNCTION match_embeddings (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_dataset text DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  metadata JSONB,
  article_id text,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    sac.id,
    sac.metadata,
    sac.article_id::text,
    sac.chunk_text,
    1 - (sac.embedding <=> query_embedding) AS similarity
  FROM support_article_chunks sac
  JOIN support_articles sa ON sac.article_id = sa.id
  WHERE (filter_dataset IS NULL OR sac.dataset = filter_dataset)
    AND 1 - (sac.embedding <=> query_embedding) > match_threshold
  ORDER BY (sac.embedding <=> query_embedding) ASC
  LIMIT match_count;
$$;

-- 4. Force PostgREST to refresh its schema cache (Supabase usually auto-reloads on DDL).
NOTIFY pgrst, 'reload schema';
