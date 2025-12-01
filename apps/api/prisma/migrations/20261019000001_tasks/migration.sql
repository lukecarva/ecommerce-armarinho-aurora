-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('a_fazer', 'em_andamento', 'aguardando', 'concluido');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('alta', 'normal', 'baixa');

-- CreateTable
CREATE TABLE "tasks" (
    "id"             TEXT          NOT NULL,
    "title"          TEXT          NOT NULL,
    "description"    TEXT,
    "status"         "task_status"   NOT NULL DEFAULT 'a_fazer',
    "priority"       "task_priority" NOT NULL DEFAULT 'normal',
    "assignee_id"    TEXT,
    "created_by_id"  TEXT          NOT NULL,
    "due_date"       TIMESTAMP(3),
    "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey"
    FOREIGN KEY ("assignee_id") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
