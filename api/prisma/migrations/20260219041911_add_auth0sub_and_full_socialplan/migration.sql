/*
  Warnings:

  - The primary key for the `SocialPlan` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `ownerSub` on the `SocialPlan` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `SocialPlan` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `SocialPlan` table. All the data in the column will be lost.
  - Added the required column `intentText` to the `SocialPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerId` to the `SocialPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SocialPlan` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `SocialPlan` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SocialPlanState" AS ENUM ('OPEN', 'DONE', 'DROPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SocialPlanTimePrecision" AS ENUM ('UNSPECIFIED', 'NONE', 'WINDOW', 'EXACT');

-- DropIndex
DROP INDEX "SocialPlan_ownerSub_idx";

-- AlterTable
ALTER TABLE "SocialPlan" DROP CONSTRAINT "SocialPlan_pkey",
DROP COLUMN "ownerSub",
DROP COLUMN "startsAt",
DROP COLUMN "title",
ADD COLUMN     "anchorEnd" TIMESTAMP(3),
ADD COLUMN     "anchorStart" TIMESTAMP(3),
ADD COLUMN     "contextNote" TEXT,
ADD COLUMN     "intentText" TEXT NOT NULL,
ADD COLUMN     "locationText" TEXT,
ADD COLUMN     "ownerId" UUID NOT NULL,
ADD COLUMN     "state" "SocialPlanState" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "timePrecision" "SocialPlanTimePrecision" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "timezone" VARCHAR(64),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "SocialPlan_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPlanParticipant" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "personId" UUID,
    "displayName" VARCHAR(120),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPlanParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPlanParticipant_planId_idx" ON "SocialPlanParticipant"("planId");

-- CreateIndex
CREATE INDEX "SocialPlanParticipant_personId_idx" ON "SocialPlanParticipant"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPlanParticipant_planId_personId_key" ON "SocialPlanParticipant"("planId", "personId");

-- CreateIndex
CREATE INDEX "SocialPlan_ownerId_state_idx" ON "SocialPlan"("ownerId", "state");

-- CreateIndex
CREATE INDEX "SocialPlan_ownerId_anchorStart_idx" ON "SocialPlan"("ownerId", "anchorStart");

-- CreateIndex
CREATE INDEX "SocialPlan_ownerId_anchorEnd_idx" ON "SocialPlan"("ownerId", "anchorEnd");

-- AddForeignKey
ALTER TABLE "SocialPlan" ADD CONSTRAINT "SocialPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPlanParticipant" ADD CONSTRAINT "SocialPlanParticipant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SocialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPlanParticipant" ADD CONSTRAINT "SocialPlanParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
