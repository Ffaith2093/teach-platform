CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
CREATE TYPE "SurveyQuestionType" AS ENUM ('SHORT_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN');

CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB,
    "order" INTEGER NOT NULL,
    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Survey_courseId_status_createdAt_idx" ON "Survey"("courseId", "status", "createdAt");
CREATE INDEX "Survey_chapterId_idx" ON "Survey"("chapterId");
CREATE UNIQUE INDEX "SurveyQuestion_surveyId_order_key" ON "SurveyQuestion"("surveyId", "order");
CREATE UNIQUE INDEX "SurveyResponse_surveyId_studentId_key" ON "SurveyResponse"("surveyId", "studentId");
CREATE INDEX "SurveyResponse_studentId_updatedAt_idx" ON "SurveyResponse"("studentId", "updatedAt");

ALTER TABLE "Survey" ADD CONSTRAINT "Survey_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Assignment"
SET "totalScore" = GREATEST(0, "totalScore" - "surveyScore"),
    "allowSurvey" = false,
    "surveyPrompt" = NULL,
    "surveyScore" = 0
WHERE "allowSurvey" = true;
