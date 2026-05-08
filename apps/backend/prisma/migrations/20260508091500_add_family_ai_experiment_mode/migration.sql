CREATE TYPE "AiExperimentMode" AS ENUM ('off', 'alternate', 'random');

ALTER TABLE "Family"
ADD COLUMN "aiExperimentMode" "AiExperimentMode";
