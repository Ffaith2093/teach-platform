ALTER TABLE "Problem"
  ALTER COLUMN "timeLimitMs" SET DEFAULT 1000,
  ALTER COLUMN "memoryLimitMb" SET DEFAULT 256;

ALTER TABLE "Assignment"
  ADD COLUMN "allowSurvey" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "surveyPrompt" TEXT,
  ADD COLUMN "surveyScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allowAttachment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedFileExtensions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "maxFileSizeMb" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "attachmentScore" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AssignmentSubmission"
  ADD COLUMN "fileName" TEXT,
  ADD COLUMN "fileMimeType" TEXT,
  ADD COLUMN "fileSizeBytes" INTEGER,
  ADD COLUMN "answers" JSONB;

CREATE TABLE "AssignmentQuestion" (
  "assignmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  CONSTRAINT "AssignmentQuestion_pkey" PRIMARY KEY ("assignmentId", "questionId")
);

CREATE INDEX "AssignmentQuestion_assignmentId_order_idx" ON "AssignmentQuestion"("assignmentId", "order");

ALTER TABLE "AssignmentQuestion"
  ADD CONSTRAINT "AssignmentQuestion_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentQuestion"
  ADD CONSTRAINT "AssignmentQuestion_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
