/*
  Warnings:

  - Added the required column `displayName` to the `Person` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Person` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Person_ownerId_idx";

-- DropIndex
DROP INDEX "SocialPlan_ownerId_anchorEnd_idx";

-- DropIndex
DROP INDEX "SocialPlan_ownerId_state_idx";

-- DropIndex
DROP INDEX "SocialPlanParticipant_personId_idx";

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "displayName" VARCHAR(120) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Person_ownerId_displayName_idx" ON "Person"("ownerId", "displayName");

-- CreateIndex
CREATE INDEX "SocialPlan_ownerId_updatedAt_idx" ON "SocialPlan"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "SocialPlan_ownerId_state_updatedAt_idx" ON "SocialPlan"("ownerId", "state", "updatedAt");
