-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "ownerSub" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_ownerSub_idx" ON "Event"("ownerSub");
