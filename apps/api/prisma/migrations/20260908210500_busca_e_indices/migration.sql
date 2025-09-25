-- Extensões e índices que o Prisma não modela.
-- Idempotentes: rodam em banco novo e em banco já existente.

-- ── Busca em português ──────────────────────────────────────────────────────
-- unaccent: "tricolíne" encontra "tricoline"
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pg_trgm: "tricolini" encontra "tricoline" por similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
    ALTER TEXT SEARCH CONFIGURATION pt_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, portuguese_stem;
  END IF;
END
$$;

-- Busca por nome de produto tolerante a erro de digitação.
CREATE INDEX IF NOT EXISTS products_name_trgm
  ON products USING gin (name gin_trgm_ops);

-- ── Estoque do produto sem variação ─────────────────────────────────────────
-- No Postgres dois NULL são valores distintos, então o índice único composto
-- (product_id, variant_id) não impede duas linhas de estoque para o mesmo
-- produto quando variant_id é nulo. Este índice parcial fecha a brecha.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_produto_sem_variacao
  ON inventory (product_id)
  WHERE variant_id IS NULL;
