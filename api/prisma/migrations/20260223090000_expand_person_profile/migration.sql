-- AlterTable
ALTER TABLE "Person"
ADD COLUMN     "pronouns" VARCHAR(80),
ADD COLUMN     "neighborhood" VARCHAR(120),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "birthdayMonth" SMALLINT,
ADD COLUMN     "birthdayDay" SMALLINT,
ADD COLUMN     "birthdayYear" SMALLINT,
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Basic birthday guards (month/day pair is all-or-nothing; year optional)
ALTER TABLE "Person"
ADD CONSTRAINT "Person_birthday_month_range" CHECK ("birthdayMonth" IS NULL OR ("birthdayMonth" >= 1 AND "birthdayMonth" <= 12)),
ADD CONSTRAINT "Person_birthday_day_range" CHECK ("birthdayDay" IS NULL OR ("birthdayDay" >= 1 AND "birthdayDay" <= 31)),
ADD CONSTRAINT "Person_birthday_year_range" CHECK ("birthdayYear" IS NULL OR ("birthdayYear" >= 1900 AND "birthdayYear" <= 2100)),
ADD CONSTRAINT "Person_birthday_month_day_pair" CHECK (
    ("birthdayMonth" IS NULL AND "birthdayDay" IS NULL)
    OR ("birthdayMonth" IS NOT NULL AND "birthdayDay" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "Person_ownerId_archivedAt_updatedAt_idx" ON "Person"("ownerId", "archivedAt", "updatedAt");
