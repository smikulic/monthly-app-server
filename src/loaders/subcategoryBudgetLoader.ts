import DataLoader from "dataloader";
import type {
  PrismaClient,
  SubcategoryBudget,
} from "../generated/prisma/client.js";

export function createSubcategoryBudgetLoader(prisma: PrismaClient) {
  return new DataLoader<string, SubcategoryBudget[]>(async (subcategoryIds) => {
    // Ascending, because every consumer walks the schedule forward: the accrual
    // sums each period up to the month it is rendering.
    const budgets = await prisma.subcategoryBudget.findMany({
      where: { subcategoryId: { in: subcategoryIds as string[] } },
      orderBy: { validFrom: "asc" },
    });

    const budgetMap: Record<string, SubcategoryBudget[]> = {};
    for (const budget of budgets) {
      if (!budgetMap[budget.subcategoryId]) {
        budgetMap[budget.subcategoryId] = [];
      }
      budgetMap[budget.subcategoryId].push(budget);
    }

    return subcategoryIds.map((id) => budgetMap[id] ?? []);
  });
}
