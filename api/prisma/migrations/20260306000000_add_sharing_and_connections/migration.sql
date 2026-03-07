-- AlterTable: Add displayName to User
ALTER TABLE "User" ADD COLUMN "displayName" VARCHAR(120);

-- AlterTable: Add linkedUserId to Person
ALTER TABLE "Person" ADD COLUMN "linkedUserId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Person_ownerId_linkedUserId_key" ON "Person"("ownerId", "linkedUserId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ConnectionInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Connection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Connection_userId_targetId_key" ON "Connection"("userId", "targetId");
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");
CREATE INDEX "Connection_targetId_idx" ON "Connection"("targetId");

ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ConnectionInvite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(64) NOT NULL,
    "senderId" UUID NOT NULL,
    "status" "ConnectionInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectionInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectionInvite_token_key" ON "ConnectionInvite"("token");
CREATE INDEX "ConnectionInvite_senderId_idx" ON "ConnectionInvite"("senderId");

ALTER TABLE "ConnectionInvite" ADD CONSTRAINT "ConnectionInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ShareToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(64) NOT NULL,
    "planId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShareToken_token_key" ON "ShareToken"("token");
CREATE INDEX "ShareToken_planId_idx" ON "ShareToken"("planId");

ALTER TABLE "ShareToken" ADD CONSTRAINT "ShareToken_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SocialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlanSubscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanSubscription_planId_userId_key" ON "PlanSubscription"("planId", "userId");
CREATE INDEX "PlanSubscription_userId_idx" ON "PlanSubscription"("userId");
CREATE INDEX "PlanSubscription_planId_idx" ON "PlanSubscription"("planId");

ALTER TABLE "PlanSubscription" ADD CONSTRAINT "PlanSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SocialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanSubscription" ADD CONSTRAINT "PlanSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
