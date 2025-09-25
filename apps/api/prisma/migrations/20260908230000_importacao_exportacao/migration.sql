-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('produtos', 'precos', 'estoque');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('simulado', 'processando', 'concluido', 'falhou', 'desfeito');

-- CreateEnum
CREATE TYPE "export_format" AS ENUM ('csv', 'xlsx', 'zip');

-- CreateEnum
CREATE TYPE "export_status" AS ENUM ('processando', 'concluido', 'falhou', 'expirado');

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "old_price" DECIMAL(10,2) NOT NULL,
    "new_price" DECIMAL(10,2) NOT NULL,
    "source" TEXT NOT NULL,
    "actor_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "import_kind" NOT NULL,
    "column_map" JSONB NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "kind" "import_kind" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'simulado',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "profile_id" TEXT,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_created" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "rows_skipped" INTEGER NOT NULL DEFAULT 0,
    "rows_error" INTEGER NOT NULL DEFAULT 0,
    "images_uploaded" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "snapshot" JSONB,
    "error" TEXT,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_runs" (
    "id" TEXT NOT NULL,
    "format" "export_format" NOT NULL,
    "status" "export_status" NOT NULL DEFAULT 'processando',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "include_images" BOOLEAN NOT NULL DEFAULT false,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "file_key" TEXT,
    "file_url" TEXT,
    "file_size" INTEGER,
    "error" TEXT,
    "expires_at" TIMESTAMP(3),
    "actor_id" TEXT,
    "actor_name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "export_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_history_product_id_createdAt_idx" ON "price_history"("product_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "import_profiles_name_kind_key" ON "import_profiles"("name", "kind");

-- CreateIndex
CREATE INDEX "import_runs_status_started_at_idx" ON "import_runs"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "export_profiles_name_key" ON "export_profiles"("name");

-- CreateIndex
CREATE INDEX "export_runs_status_createdAt_idx" ON "export_runs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "import_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

