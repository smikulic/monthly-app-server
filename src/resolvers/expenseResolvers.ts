import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";
import type { AuthContext } from "../utils/secured.js";
import {
  categoryScopeWhere,
  canAccessCategory,
  canManage,
} from "../utils/scope.js";
import { amountForMonth } from "../utils/budgetPeriods.js";
import type { BudgetPeriod } from "../utils/budgetPeriods.js";
import { buildDisplayNames } from "../utils/sharedSpend.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

// Resolve who paid an expense. Defaults to the caller. A different payer is only
// allowed when the category is shared with a group, and that payer is a member.
async function resolvePaidByUserId(
  context: AuthContext,
  category: { groupId: string | null },
  requestedPayerId: string | undefined,
): Promise<string> {
  const callerId = context.currentUser.id;
  if (!requestedPayerId || requestedPayerId === callerId) {
    return callerId;
  }
  if (!category.groupId) {
    throw new Error("Cannot set a different payer on a personal category");
  }
  const member = await context.prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: category.groupId, userId: requestedPayerId },
    },
  });
  if (!member) {
    throw new Error("The payer must be a member of the group");
  }
  return requestedPayerId;
}

export const expenseResolvers = {
  Query: {
    expenses: secured((parent, args, context) => {
      // Scope expenses by the access of their subcategory's parent category.
      const whereClause: any = {
        subcategory: { category: categoryScopeWhere(args, context) },
      };

      if (args.filter && args.filter.date) {
        whereClause.date = getFilterDateRange(args.filter.date);
      }

      const expensesResponse = context.prisma.expense.findMany({
        where: whereClause,
        include: {
          user: true,
        },
        orderBy: {
          date: "asc", // or 'desc' for descending order
        },
      });

      return expensesResponse;
    }),
    chartExpenses: secured(async (parent, args, context) => {
      const filterDate = args.filter.date;
      const filterDateYear = new Date(filterDate).getFullYear();

      const startDate = new Date(`${filterDateYear}-01-01`);
      const endDate = new Date(`${filterDateYear}-12-31`);

      const categoryWhere = categoryScopeWhere(args, context);
      const dateRange = { gte: startDate, lte: endDate };

      const expensesResponse = await context.prisma.expense.findMany({
        where: {
          subcategory: { category: categoryWhere },
          date: dateRange,
        },
        select: {
          amount: true,
          date: true,
          subcategoryId: true,
          // Who paid, for the shared-spend series below.
          userId: true,
          user: { select: { name: true, email: true } },
        },
      });

      // Initialize an array of 12 zeros (for each month's total expenses).
      const monthlyTotals = new Array(12).fill(0);

      expensesResponse.forEach((expense) => {
        const month = expense.date.getMonth(); // getMonth() returns a zero-based index.
        monthlyTotals[month] += expense.amount;
      });

      /*
       * The budget line, one value per month. It is a series rather than a
       * single figure because the amount can change mid-year: drawing it flat
       * at today's rate would re-cost January at December's budget, which is
       * the bug the budget schedule exists to prevent.
       */
      const scheduled = await context.prisma.subcategory.findMany({
        where: { category: categoryWhere },
        select: {
          id: true,
          // groupId marks the category as shared, which is what the per-person
          // series is scoped to.
          category: { select: { groupId: true } },
          budgets: {
            orderBy: { validFrom: "asc" },
            select: { amount: true, validFrom: true },
          },
        },
      });

      const monthlyBudgets = Array.from({ length: 12 }, (_, month) =>
        scheduled.reduce(
          (total: number, subcategory: { budgets: BudgetPeriod[] }) =>
            total +
            (amountForMonth(
              subcategory.budgets,
              new Date(Date.UTC(filterDateYear, month, 1)),
            ) ?? 0),
          0,
        ),
      );

      /*
       * Shared spend across the year, one series per person. Scoped to
       * categories with a group: personal spend has nobody to compare against,
       * and mixing it in would make the lines mean two different things.
       */
      const sharedSubcategoryIds = new Set(
        scheduled
          .filter((s: { category: { groupId: string | null } }) =>
            Boolean(s.category.groupId),
          )
          .map((s: { id: string }) => s.id),
      );

      const sharedExpenses = sharedSubcategoryIds.size
        ? expensesResponse.filter((e) => sharedSubcategoryIds.has(e.subcategoryId))
        : [];

      const groupIds = [
        ...new Set(
          (
            await context.prisma.category.findMany({
              where: { AND: [categoryWhere, { groupId: { not: null } }] },
              select: { groupId: true },
            })
          )
            .map((c: { groupId: string | null }) => c.groupId)
            .filter((id: string | null): id is string => !!id),
        ),
      ];

      const members = groupIds.length
        ? await context.prisma.groupMember.findMany({
            where: { groupId: { in: groupIds } },
            select: {
              userId: true,
              user: { select: { name: true, email: true } },
            },
          })
        : [];

      const sharedNames = buildDisplayNames(members, sharedExpenses);

      // userId -> 12 months
      const perUserMonths = new Map<string, number[]>(
        [...sharedNames.keys()].map((userId) => [userId, new Array(12).fill(0)]),
      );

      for (const expense of sharedExpenses) {
        const series = perUserMonths.get(expense.userId);
        if (series) series[expense.date.getMonth()] += expense.amount;
      }

      const sharedMonthlyByUser = [...perUserMonths.entries()]
        .map(([userId, months]) => ({
          userId,
          name: sharedNames.get(userId) || "Unknown",
          monthlyTotals: months,
          total: months.reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

      // do a prisma.groupBy to get sums per subcategory
      const grouped = await context.prisma.expense.groupBy({
        by: ["subcategoryId"],
        where: {
          subcategory: { category: categoryWhere },
          date: dateRange,
        },
        _sum: { amount: true },
      });

      // fetch the corresponding subcategories + their parent categories in one go
      const subcategoryIds = grouped.map((g) => g.subcategoryId);
      const subcats = await context.prisma.subcategory.findMany({
        where: { id: { in: subcategoryIds } },
        include: { category: true },
      });

      // 5) stitch them together into your “pie‐slice” shape
      const categoryExpenseTotals = grouped.map((g) => {
        const sub = subcats.find((s) => s.id === g.subcategoryId);
        return {
          categoryName: sub?.category?.name ?? "Unknown Category",
          subcategoryName: sub?.name ?? "Unknown Subcategory",
          total: g._sum.amount || 0,
        };
      });

      return {
        monthlyTotals,
        monthlyBudgets,
        sharedMonthlyByUser,
        categoryExpenseTotals,
      };
    }),
  },
  Mutation: {
    createExpense: secured(async (parent, args, context) => {
      // Validate amount
      const amountValidation = validatePositiveInteger(args.amount, "amount");
      if (!amountValidation.isValid) {
        throw new Error(
          `Amount validation failed: ${amountValidation.errors.join(", ")}`,
        );
      }

      // Validate date
      const dateValidation = validateDate(args.date, "date");
      if (!dateValidation.isValid) {
        throw new Error(
          `Date validation failed: ${dateValidation.errors.join(", ")}`,
        );
      }

      // Validate subcategoryId exists
      if (!args.subcategoryId || typeof args.subcategoryId !== "string") {
        throw new Error(
          "Subcategory ID is required and must be a valid string",
        );
      }

      // Verify the caller can access the subcategory's parent category
      const subcategory = await context.prisma.subcategory.findUnique({
        where: { id: args.subcategoryId },
        select: { category: { select: { userId: true, groupId: true } } },
      });

      if (!subcategory || !canAccessCategory(subcategory.category, context)) {
        throw new Error("Subcategory not found or doesn't belong to user");
      }

      // Who paid (attribution): the caller by default, or another group member.
      const paidByUserId = await resolvePaidByUserId(
        context,
        subcategory.category,
        args.paidByUserId,
      );

      const [y, m, d] = args.date.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      return await context.prisma.expense.create({
        data: {
          amount: args.amount,
          description: args.description
            ? sanitizeString(args.description, 255)
            : null,
          date: dateForStorage,
          // userId records who paid / entered the expense (attribution).
          user: { connect: { id: paidByUserId } },
          subcategory: { connect: { id: args.subcategoryId } },
        },
      });
    }),
    updateExpense: secured(async (parent, args, context) => {
      // Access follows the expense's subcategory's parent category, so any
      // member of a shared category can edit its expenses.
      const existingExpense = await context.prisma.expense.findUnique({
        where: { id: args.id },
        select: {
          userId: true,
          subcategory: {
            select: { category: { select: { userId: true, groupId: true } } },
          },
        },
      });

      if (
        !existingExpense ||
        !canManage(
          existingExpense.userId,
          existingExpense.subcategory.category,
          context
        )
      ) {
        throw new Error("Expense not found or doesn't belong to user");
      }

      // Validate amount if provided
      if (args.amount !== undefined) {
        const amountValidation = validatePositiveInteger(args.amount, "amount");
        if (!amountValidation.isValid) {
          throw new Error(
            `Amount validation failed: ${amountValidation.errors.join(", ")}`,
          );
        }
      }

      // Validate date if provided
      let dateForStorage = undefined;
      if (args.date !== undefined) {
        const dateValidation = validateDate(args.date, "date");
        if (!dateValidation.isValid) {
          throw new Error(
            `Date validation failed: ${dateValidation.errors.join(", ")}`,
          );
        }

        const [y, m, d] = args.date.split("-").map(Number);
        dateForStorage = new Date(Date.UTC(y, m - 1, d));
      }

      // The category the expense will belong to (its current one, or the new
      // one if moving subcategory). Used to validate the payer.
      let targetCategory = existingExpense.subcategory.category;

      // If moving to another subcategory, verify access to it too
      if (args.subcategoryId !== undefined) {
        if (!args.subcategoryId || typeof args.subcategoryId !== "string") {
          throw new Error("Subcategory ID must be a valid string");
        }

        const subcategory = await context.prisma.subcategory.findUnique({
          where: { id: args.subcategoryId },
          select: { category: { select: { userId: true, groupId: true } } },
        });

        if (!subcategory || !canAccessCategory(subcategory.category, context)) {
          throw new Error("Subcategory not found or doesn't belong to user");
        }
        targetCategory = subcategory.category;
      }

      // Re-attribute the payer only when explicitly provided.
      let payerConnect = undefined;
      if (args.paidByUserId !== undefined) {
        const payerId = await resolvePaidByUserId(
          context,
          targetCategory,
          args.paidByUserId,
        );
        payerConnect = { connect: { id: payerId } };
      }

      return await context.prisma.expense.update({
        where: {
          id: args.id,
        },
        data: {
          amount: args.amount,
          description: args.description
            ? sanitizeString(args.description, 255)
            : args.description,
          date: dateForStorage,
          subcategory: args.subcategoryId
            ? { connect: { id: args.subcategoryId } }
            : undefined,
          user: payerConnect,
        },
      });
    }),
    deleteExpense: secured(async (parent, args, context) => {
      // Verify access via the expense's parent category before deleting
      const existingExpense = await context.prisma.expense.findUnique({
        where: { id: args.id },
        select: {
          userId: true,
          subcategory: {
            select: { category: { select: { userId: true, groupId: true } } },
          },
        },
      });

      if (
        !existingExpense ||
        !canManage(
          existingExpense.userId,
          existingExpense.subcategory.category,
          context
        )
      ) {
        notFoundError("Expense");
      }

      await context.prisma.expense.delete({ where: { id: args.id } });

      return { id: args.id }; // Return minimal data for confirmation
    }),
  },
  Expense: {
    // userId stores who paid; resolve it to the member for display/attribution.
    paidBy: secured((parent, _args, context) =>
      context.prisma.user.findUnique({ where: { id: parent.userId } }),
    ),
  },
};
