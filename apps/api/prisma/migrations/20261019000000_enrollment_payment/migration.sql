-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('pix', 'dinheiro', 'cartao', 'cortesia');

-- AlterTable
ALTER TABLE "course_enrollments"
  ADD COLUMN "paid_at"        TIMESTAMP(3),
  ADD COLUMN "paid_amount"    INTEGER,
  ADD COLUMN "payment_method" "payment_method";
