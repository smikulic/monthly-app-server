-- AlterTable
-- Nullable with no default: NULL means "has not seen the first-run tour", which
-- is exactly what every existing user should be. Backfilling a date would hide
-- the tour from everyone who has never been offered it.
ALTER TABLE "User" ADD COLUMN "onboardingSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DemoDataset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoDataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoDataset_key_key" ON "DemoDataset"("key");
