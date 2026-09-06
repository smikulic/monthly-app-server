-- CreateTable
CREATE TABLE "SubcategoryBudget" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "subcategoryId" TEXT NOT NULL,

    CONSTRAINT "SubcategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_subcategorybudgets_subcategoryid_validfrom" ON "SubcategoryBudget"("subcategoryId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SubcategoryBudget_subcategoryId_validFrom_key" ON "SubcategoryBudget"("subcategoryId", "validFrom");

-- AddForeignKey
ALTER TABLE "SubcategoryBudget" ADD CONSTRAINT "SubcategoryBudget_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one period per existing subcategory, carrying the amount it already
-- has from the date it already accrues from. Every subcategory ends up with a
-- schedule that produces exactly the numbers it produced before, so this
-- migration changes no reported figure on its own.
--
-- `validFrom` is truncated to the month because the accrual counts whole months;
-- `rolloverDate` has a day component that has never meant anything.
INSERT INTO "SubcategoryBudget" ("id", "createdAt", "amount", "validFrom", "subcategoryId")
SELECT
    gen_random_uuid()::text,
    CURRENT_TIMESTAMP,
    "budgetAmount",
    date_trunc('month', "rolloverDate"),
    "id"
FROM "Subcategory"
ON CONFLICT ("subcategoryId", "validFrom") DO NOTHING;
