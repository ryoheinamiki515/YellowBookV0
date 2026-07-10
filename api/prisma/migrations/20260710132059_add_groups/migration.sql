-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonGroup" (
    "groupId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonGroup_pkey" PRIMARY KEY ("groupId","personId")
);

-- CreateIndex
CREATE INDEX "Group_ownerId_name_idx" ON "Group"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Group_ownerId_name_key" ON "Group"("ownerId", "name");

-- CreateIndex
CREATE INDEX "PersonGroup_personId_idx" ON "PersonGroup"("personId");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonGroup" ADD CONSTRAINT "PersonGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonGroup" ADD CONSTRAINT "PersonGroup_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
