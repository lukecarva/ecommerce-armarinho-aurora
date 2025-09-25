-- Busca da vitrine: coluna de índice textual, termos buscados e apoio para
-- tolerância a erro de digitação.
--
-- Idempotente, como as anteriores: roda em banco novo e em banco já existente.

-- ── Índice textual do produto ───────────────────────────────────────────────
-- Coluna gerada pelo próprio Postgres. Fica sempre em dia sem gatilho e sem
-- código de aplicação: quem escreve o produto não precisa saber que a busca
-- existe.
--
-- Os pesos ordenam o resultado: quem casa no nome (A) vem antes de quem casa
-- só na descrição (C). "Linha" no nome de uma linha de costura ganha de
-- "linha" no meio do texto de um tecido.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('pt_unaccent', coalesce(name, '')),        'A') ||
    setweight(to_tsvector('pt_unaccent', coalesce(sku_futura, '')),  'A') ||
    setweight(to_tsvector('pt_unaccent', coalesce(short_desc, '')),  'B') ||
    setweight(to_tsvector('pt_unaccent', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS products_search_vector
  ON products USING gin (search_vector);

-- Sem acerto no índice textual, caímos em similaridade. O índice de trigrama
-- do nome já existe (20260908210500); este cobre o resumo, onde costuma estar
-- a composição do tecido que a cliente digita ("100 algodao").
CREATE INDEX IF NOT EXISTS products_short_desc_trgm
  ON products USING gin (short_desc gin_trgm_ops);

-- ── Termos buscados ─────────────────────────────────────────────────────────
-- Busca sem resultado é a informação mais barata que a loja tem: diz o que a
-- cliente procurou e não achou.
CREATE TABLE IF NOT EXISTS search_queries (
  id             TEXT         NOT NULL,
  term           TEXT         NOT NULL,
  normalized     TEXT         NOT NULL,
  results_count  INTEGER      NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT search_queries_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "search_queries_normalized_createdAt_idx"
  ON search_queries (normalized, "createdAt");

CREATE INDEX IF NOT EXISTS "search_queries_results_count_createdAt_idx"
  ON search_queries (results_count, "createdAt");
