-- AlterTable: course_sessions — tipo do cachê do professor (fixo ou porcentagem)
ALTER TABLE "course_sessions" ADD COLUMN "instructor_fee_type" TEXT DEFAULT 'fixo';
