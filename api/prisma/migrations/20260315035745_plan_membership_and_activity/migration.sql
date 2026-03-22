/*
  Warnings:

  - You are about to drop the `PlanSubscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PlanMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "PlanMemberResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'MAYBE');

-- CreateEnum
CREATE TYPE "PlanActivityKind" AS ENUM ('MESSAGE', 'RESPONSE', 'STATE_CHANGE', 'MILESTONE');

-- DropForeignKey
ALTER TABLE "PlanSubscription" DROP CONSTRAINT "PlanSubscription_planId_fkey";

-- DropForeignKey
ALTER TABLE "PlanSubscription" DROP CONSTRAINT "PlanSubscription_userId_fkey";

-- AlterTable
ALTER TABLE "Connection" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ConnectionInvite" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Person" ALTER COLUMN "birthdayMonth" SET DATA TYPE INTEGER,
ALTER COLUMN "birthdayDay" SET DATA TYPE INTEGER,
ALTER COLUMN "birthdayYear" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "ShareToken" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable (before drop so we can migrate data)
CREATE TABLE "PlanMembership" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "PlanMemberRole" NOT NULL DEFAULT 'MEMBER',
    "response" "PlanMemberResponse" NOT NULL DEFAULT 'PENDING',
    "privateNote" TEXT,
    "markedDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanActivity" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" "PlanActivityKind" NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanMembership_userId_idx" ON "PlanMembership"("userId");

-- CreateIndex
CREATE INDEX "PlanMembership_planId_idx" ON "PlanMembership"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMembership_planId_userId_key" ON "PlanMembership"("planId", "userId");

-- CreateIndex
CREATE INDEX "PlanActivity_planId_createdAt_idx" ON "PlanActivity"("planId", "createdAt");

-- MigrateData: create OWNER memberships from SocialPlan
INSERT INTO "PlanMembership" ("id", "planId", "userId", "role", "response", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", "ownerId", 'OWNER', 'ACCEPTED', "createdAt", "createdAt"
FROM "SocialPlan";

-- MigrateData: copy PlanSubscription rows as MEMBER memberships
INSERT INTO "PlanMembership" ("id", "planId", "userId", "role", "response", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "planId", "userId", 'MEMBER', 'PENDING', "createdAt", "createdAt"
FROM "PlanSubscription";

-- DropTable (now safe — data migrated)
DROP TABLE "PlanSubscription";

-- AddForeignKey
ALTER TABLE "PlanMembership" ADD CONSTRAINT "PlanMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SocialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMembership" ADD CONSTRAINT "PlanMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanActivity" ADD CONSTRAINT "PlanActivity_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SocialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanActivity" ADD CONSTRAINT "PlanActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
