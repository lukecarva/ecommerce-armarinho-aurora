-- Conteúdo editável (banners, blocos da home, páginas) e cursos presenciais
-- com turmas e inscrições. Menu, rodapé e avisos moram em `settings`.

-- CreateEnum
CREATE TYPE "banner_tone" AS ENUM ('marca', 'destaque', 'escuro');

-- CreateEnum
CREATE TYPE "home_section_type" AS ENUM ('banners', 'categorias', 'ofertas', 'colecoes', 'cursos', 'novidades', 'texto');

-- CreateEnum
CREATE TYPE "course_level" AS ENUM ('todos', 'iniciante', 'intermediario', 'avancado');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('pendente', 'confirmada', 'lista_de_espera', 'cancelada');

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "cta_label" TEXT,
    "cta_url" TEXT,
    "image_desktop_url" TEXT,
    "image_mobile_url" TEXT,
    "image_alt" TEXT,
    "tone" "banner_tone" NOT NULL DEFAULT 'marca',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_sections" (
    "id" TEXT NOT NULL,
    "type" "home_section_type" NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "seo" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "cover_url" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "duration_minutes" INTEGER,
    "level" "course_level" NOT NULL DEFAULT 'todos',
    "materials" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sessions" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "room" TEXT,
    "instructor" TEXT,
    "seats_total" INTEGER NOT NULL,
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "status" "enrollment_status" NOT NULL DEFAULT 'pendente',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_active_position_idx" ON "banners"("active", "position");

-- CreateIndex
CREATE INDEX "home_sections_position_idx" ON "home_sections"("position");

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_active_position_idx" ON "courses"("active", "position");

-- CreateIndex
CREATE INDEX "course_sessions_course_id_starts_at_idx" ON "course_sessions"("course_id", "starts_at");

-- CreateIndex
CREATE INDEX "course_sessions_starts_at_idx" ON "course_sessions"("starts_at");

-- CreateIndex
CREATE INDEX "course_enrollments_session_id_status_idx" ON "course_enrollments"("session_id", "status");

-- CreateIndex
CREATE INDEX "course_enrollments_phone_idx" ON "course_enrollments"("phone");

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "course_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

