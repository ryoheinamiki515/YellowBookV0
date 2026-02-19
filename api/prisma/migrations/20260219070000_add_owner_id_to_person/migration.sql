/*
  Warnings:

  - Added the required column `ownerId` to the `Person` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "ownerId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "Person_ownerId_idx" ON "Person"("ownerId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
