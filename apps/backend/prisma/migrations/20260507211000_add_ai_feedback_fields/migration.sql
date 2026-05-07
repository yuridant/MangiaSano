ALTER TABLE "AiGenerationLog"
ADD COLUMN "feedbackRating" TEXT,
ADD COLUMN "feedbackAt" TIMESTAMP(3),
ADD COLUMN "savedToMenuAt" TIMESTAMP(3);
