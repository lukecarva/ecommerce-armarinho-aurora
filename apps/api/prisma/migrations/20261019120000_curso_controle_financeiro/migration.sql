-- AlterTable: course_sessions — campos de controle do professor
ALTER TABLE "course_sessions" ADD COLUMN "instructor_phone" TEXT;
ALTER TABLE "course_sessions" ADD COLUMN "instructor_fee" INTEGER;
ALTER TABLE "course_sessions" ADD COLUMN "instructor_paid_amount" INTEGER;
ALTER TABLE "course_sessions" ADD COLUMN "instructor_paid_at" TIMESTAMPTZ(3);

-- AlterTable: course_enrollments — valor total combinado com o aluno
ALTER TABLE "course_enrollments" ADD COLUMN "total_amount" INTEGER;
