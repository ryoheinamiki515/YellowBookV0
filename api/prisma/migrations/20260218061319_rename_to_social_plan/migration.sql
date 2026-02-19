/*
  Warnings:

  - You are about to drop the `Event` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Event";

-- CreateTable
CREATE TABLE "SocialPlan" (
    "id" TEXT NOT NULL,
    "ownerSub" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPlan_ownerSub_idx" ON "SocialPlan"("ownerSub");
