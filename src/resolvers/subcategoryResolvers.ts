import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";
import { canAccessCategory, canManage } from "../utils/scope.js";
import {
  accruedBudget,
  amountForMonth,
  parseMonthStartUTC,
} from "../utils/budgetPeriods.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

/**
 * Both flat columns are caches of the schedule, which is the truth. Deriving
 * them here rather than writing them directly is what stops either drifting.
 *
 * `budgetAmount` is "what does this cost right now", read by reports, insights
 * and the weekly reminder. `rolloverDate` is the month the schedule opens.
 */
async function syncToSchedule(tx: any, subcategoryId: string) {
  const periods = await tx.subcategoryBudget.findMany({
    where: { subcategoryId },
    orderBy: { validFrom: "asc" },
  });

  return tx.subcategory.update({
    where: { id: subcategoryId },
    data: {
      budgetAmount: amountForMonth(periods, new Date()) ?? periods[0].amount,
      rolloverDate: periods[0].validFrom,
    },
  });
}

/** Loads the schedule and the caller's access in one place. */
async function manageableSubcategory(context: any, subcategoryId: string) {
  const subcategory = await context.prisma.subcategory.findUnique({
    where: { id: subcategoryId },
    include: { category: { select: { userId: true, groupId: true } } },
  });

  if (
    !subcategory ||
    !canManage(subcategory.category.userId, subcategory.category, context)
  ) {
    throw new Error("Subcategory not found or doesn't belong to user");
  }

  return subcategory;
}

function validated(value: unknown, name: string, kind: "int" | "date") {
  const result =
    kind === "int"
      ? validatePositiveInteger(value, name)
      : validateDate(value as string, name);

  if (!result.isValid) {
    throw new Error(`${name} validation failed: ${result.errors.join(", ")}`);
  }
}

export const subcategoryResolvers = {
  Query: {
    subcategory: secured(async (parent, args, context) => {
      // Access follows the parent category (personal owner, or group member).
      const subcategoryResponse = await context.prisma.subcategory.findUnique({
        where: { id: args.id },
        include: { category: { select: { userId: true, groupId: true } } },
      });

      if (
        !subcategoryResponse ||
        !canAccessCategory(subcategoryResponse.category, context)
      ) {
        notFoundError("Subcategory");
      }

      return subcategoryResponse;
    }),
  },
  Mutation: {
    createSubcategory: secured(async (parent, args, context) => {
      if (
        !args.name ||
        typeof args.name !== "string" ||
        args.name.trim().length === 0
      ) {
        throw new Error("Subcategory name is required");
      }

      validated(args.budgetAmount, "budgetAmount", "int");
      validated(args.validFrom, "validFrom", "date");

      const category = await context.prisma.category.findUnique({
        where: { id: args.categoryId },
        select: { userId: true, groupId: true },
      });

      if (!category || !canAccessCategory(category, context)) {
        throw new Error("Category not found or doesn't belong to user");
      }

      const validFrom = parseMonthStartUTC(args.validFrom);

      // The opening period lands with the row: a subcategory whose schedule is
      // empty has no budget in any month. Both flat columns mirror that period,
      // which is what syncToSchedule maintains from here on.
      return await context.prisma.subcategory.create({
        data: {
          name: sanitizeString(args.name, 100),
          budgetAmount: args.budgetAmount,
          rolloverDate: validFrom,
          icon: args.icon ? sanitizeString(args.icon, 50) : "",
          category: { connect: { id: args.categoryId } },
          budgets: { create: { amount: args.budgetAmount, validFrom } },
        },
      });
    }),
    updateSubcategory: secured(async (parent, args, context) => {
      await manageableSubcategory(context, args.id);

      if (args.categoryId) {
        const category = await context.prisma.category.findUnique({
          where: { id: args.categoryId },
          select: { userId: true, groupId: true },
        });

        if (!category || !canAccessCategory(category, context)) {
          throw new Error("Category not found or doesn't belong to user");
        }
      }

      return await context.prisma.subcategory.update({
        where: { id: args.id },
        data: { categoryId: args.categoryId, name: args.name },
      });
    }),
    setSubcategoryBudget: secured(async (_parent, args, context) => {
      validated(args.amount, "amount", "int");
      validated(args.validFrom, "validFrom", "date");
      await manageableSubcategory(context, args.subcategoryId);

      const validFrom = parseMonthStartUTC(args.validFrom);

      return await context.prisma.$transaction(async (tx) => {
        // Upsert, not create: setting the same month twice is the user
        // correcting the figure they just entered, not a second period.
        await tx.subcategoryBudget.upsert({
          where: {
            subcategoryId_validFrom: {
              subcategoryId: args.subcategoryId,
              validFrom,
            },
          },
          create: {
            subcategoryId: args.subcategoryId,
            amount: args.amount,
            validFrom,
          },
          update: { amount: args.amount },
        });

        return syncToSchedule(tx, args.subcategoryId);
      });
    }),
    deleteSubcategoryBudget: secured(async (_parent, args, context) => {
      validated(args.validFrom, "validFrom", "date");
      await manageableSubcategory(context, args.subcategoryId);

      const validFrom = parseMonthStartUTC(args.validFrom);

      return await context.prisma.$transaction(async (tx) => {
        const periods = await tx.subcategoryBudget.findMany({
          where: { subcategoryId: args.subcategoryId },
          orderBy: { validFrom: "asc" },
        });

        // Removing the last one leaves no budget in any month, which the UI has
        // no way to show and no way to undo.
        if (periods.length <= 1) {
          throw new Error("A subcategory needs at least one budget period");
        }

        const target = periods.find(
          (period: { validFrom: Date }) =>
            period.validFrom.getTime() === validFrom.getTime(),
        );

        if (!target) {
          throw new Error("No budget period starts in that month");
        }

        await tx.subcategoryBudget.delete({ where: { id: target.id } });

        return syncToSchedule(tx, args.subcategoryId);
      });
    }),
    deleteSubcategory: secured(
      async (_parent, args: { id: string }, context, _info) => {
        await manageableSubcategory(context, args.id);

        return await context.prisma.subcategory.delete({
          where: { id: args.id },
        });
      },
    ),
  },
  Subcategory: {
    budgets: secured((parent, _args, context) =>
      context.loaders.subcategoryBudget.load(parent.id),
    ),
    budgetForMonth: secured(async (parent, args, context) => {
      const periods = await context.loaders.subcategoryBudget.load(parent.id);
      return amountForMonth(periods, parseMonthStartUTC(args.date)) ?? 0;
    }),
    rolloverRemaining: secured(async (parent, args, context) => {
      const month = parseMonthStartUTC(args.date);
      const monthEnd = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
      );

      const [periods, spent] = await Promise.all([
        context.loaders.subcategoryBudget.load(parent.id),
        context.loaders.subcategorySpend.load(
          `${parent.id}|${monthEnd.toISOString()}`,
        ),
      ]);

      return accruedBudget(periods, month) - spent;
    }),
    expenses: secured((parent, args, context) => {
      const filterDateRange = getFilterDateRange(args.filter.date);

      return context.prisma.expense.findMany({
        where: { subcategoryId: parent.id, date: filterDateRange },
        orderBy: { createdAt: "asc" },
      });
    }),
  },
};
