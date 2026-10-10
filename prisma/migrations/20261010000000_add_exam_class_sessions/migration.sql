CREATE TYPE "ExamClassStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED');

CREATE TABLE "ExamClassSession" (
    "examId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "status" "ExamClassStatus" NOT NULL DEFAULT 'PENDING',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamClassSession_pkey" PRIMARY KEY ("examId", "classId")
);

CREATE INDEX "ExamClassSession_classId_status_idx" ON "ExamClassSession"("classId", "status");

ALTER TABLE "ExamClassSession" ADD CONSTRAINT "ExamClassSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamClassSession" ADD CONSTRAINT "ExamClassSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
