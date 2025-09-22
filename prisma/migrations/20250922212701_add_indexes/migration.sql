-- CreateIndex
CREATE INDEX "idx_categories_userid_createdat" ON "Category"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_expenses_userid_date" ON "Expense"("userId", "date");

-- CreateIndex
CREATE INDEX "idx_expenses_subcategoryid_date" ON "Expense"("subcategoryId", "date");

-- CreateIndex
CREATE INDEX "idx_investments_userid" ON "Investment"("userId");

-- CreateIndex
CREATE INDEX "idx_savinggoals_userid" ON "SavingGoal"("userId");

-- CreateIndex
CREATE INDEX "idx_subcategories_categoryid" ON "Subcategory"("categoryId");
