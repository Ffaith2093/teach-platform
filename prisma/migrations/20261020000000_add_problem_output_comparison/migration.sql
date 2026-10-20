ALTER TABLE "Problem"
ADD COLUMN "ignoreOutputWhitespace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ignoreOutputPunctuation" BOOLEAN NOT NULL DEFAULT false;
