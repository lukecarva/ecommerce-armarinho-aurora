-- Extensões necessárias para a busca em português do catálogo.
-- Rodam automaticamente na primeira subida do container.

-- Remove acentos: "tricolíne" encontra "tricoline"
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Similaridade por trigramas: "tricolini" encontra "tricoline"
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Configuração de busca em português que ignora acentos.
-- Usada pelo tsvector dos produtos.
CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);

ALTER TEXT SEARCH CONFIGURATION pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, portuguese_stem;
