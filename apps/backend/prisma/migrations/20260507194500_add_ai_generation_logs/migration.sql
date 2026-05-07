-- CreateTable
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3),
    "model" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "requestedMealCount" INTEGER NOT NULL,
    "existingRecipeCount" INTEGER NOT NULL,
    "existingIngredientCount" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedInputCostUsd" DOUBLE PRECISION,
    "estimatedOutputCostUsd" DOUBLE PRECISION,
    "estimatedTotalCostUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "openaiResponseId" TEXT,
    "errorMessage" TEXT,
    "requestBreakdown" JSONB,
    "responseBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerationLog_familyId_createdAt_idx" ON "AiGenerationLog"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationLog_userId_createdAt_idx" ON "AiGenerationLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
