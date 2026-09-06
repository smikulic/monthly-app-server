import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";
import { canAccessCategory, canManage } from "../utils/scope.js";
import {
  amountForMonth,
  parseMonthStartUTC,
  toMonthStartUTC,
} from "../utils/budgetPeriods.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

/**
 * Re-derives the two flat fields from the schedule, which owns both.
 *
 * `budgetAmount` is whatever applies this month, so a raise booked for next year
 * does not change what this month reports. `rolloverDate` is where the schedule
 * opens: the accrual counts from it and the expense list filters on it, so it
 * has to follow the earliest period or the two ends stop lining up.
 */
async function syncSubcategoryToSchedule(tx: any, subcategoryId: string) {
  const periods = await tx.subcategoryBudget.findMany({
    where: { subcategoryId },
    orderBy: { validFrom: "asc" },
  });

  if (periods.length === 0) {
    return tx.subcategory.findUnique({ where: { id: subcategoryId } });
  }

  return tx.subcategory.update({
    where: { id: subcategoryId },
    data: {
      budgetAmount: amountForMonth(periods, new Date()) ?? periods[0].amount,
      rolloverDate: periods[0].validFrom,
    },
  });
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
      // Validate inputs
      if (
        !args.name ||
        typeof args.name !== "string" ||
        args.name.trim().length === 0
      ) {
        throw new Error("Subcategory name is required");
      }

      const budgetValidation = validatePositiveInteger(
        args.budgetAmount,
        "budgetAmount",
      );
      if (!budgetValidation.isValid) {
        throw new Error(
          `Budget amount validation failed: ${budgetValidation.errors.join(
            ", ",
          )}`,
        );
      }

      const dateValidation = validateDate(args.rolloverDate, "rolloverDate");
      if (!dateValidation.isValid) {
        throw new Error(
          `Rollover date validation failed: ${dateValidation.errors.join(", ")}`,
        );
      }

      // Verify the caller can access the parent category
      const category = await context.prisma.category.findUnique({
        where: { id: args.categoryId },
        select: { userId: true, groupId: true },
      });

      if (!category || !canAccessCategory(category, context)) {
        throw new Error("Category not found or doesn't belong to user");
      }

      const [y, m, d] = args.rolloverDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      // The opening period is created alongside the row: a subcategory whose
      // schedule is empty has no budget in any month, so the two have to land
      // together.
      return await context.prisma.subcategory.create({
        data: {
          name: sanitizeString(args.name, 100),
          budgetAmount: args.budgetAmount,
          rolloverDate: dateForStorage,
          icon: args.icon ? sanitizeString(args.icon, 50) : "",
          category: { connect: { id: args.categoryId } },
          budgets: {
            create: {
              amount: args.budgetAmount,
              validFrom: toMonthStartUTC(dateForStorage),
            },
          },
        },
      });
    }),
    updateSubcategory: secured(async (parent, args, context) => {
      // Verify access via the subcategory's current parent category
      const existingSubcategory = await context.prisma.subcategory.findUnique({
        where: { id: args.id },
        include: { category: { select: { userId: true, groupId: true } } },
      });

      if (
        !existingSubcategory ||
        !canManage(
          existingSubcategory.category.userId,
          existingSubcategory.category,
          context
        )
      ) {
        throw new Error("Subcategory not found or doesn't belong to user");
      }

      // If reassigning to a category, verify access to the new category too
      if (args.categoryId) {
        const category = await context.prisma.category.findUnique({
          where: { id: args.categoryId },
          select: { userId: true, groupId: true },
        });

        if (!category || !canAccessCategory(category, context)) {
          throw new Error("Category not found or doesn't belong to user");
        }
      }

      /*
       * The schedule owns the amounts, so a caller that says nothing about them
       * only renames or re-files the subcategory. When one does pass an amount
       * this is the "it was always wrong" path: it corrects in place rather than
       * opening a period, which is setSubcategoryBudget's job.
       */
      const editsAmount = args.budgetAmount != null;
      const monthStart = args.rolloverDate
        ? parseMonthStartUTC(args.rolloverDate)
        : null;

      if (args.rolloverDate) {
        const dateValidation = validateDate(args.rolloverDate, "rolloverDate");
        if (!dateValidation.isValid) {
          throw new Error(
            `Rollover date validation failed: ${dateValidation.errors.join(", ")}`,
          );
        }
      }

      const periods = editsAmount
        ? await context.prisma.subcategoryBudget.findMany({
            where: { subcategoryId: args.id },
            orderBy: { validFrom: "asc" },
          })
        : [];

      return await context.prisma.$transaction(async (tx) => {
        if (!editsAmount) {
          // Nothing to do to the schedule.
        } else if (periods.length === 0) {
          await tx.subcategoryBudget.create({
            data: {
              subcategoryId: args.id,
              amount: args.budgetAmount,
              // No date given means the schedule keeps opening where it already
              // did, which is what rolloverDate still records.
              validFrom:
                monthStart ?? toMonthStartUTC(existingSubcategory.rolloverDate),
            },
          });
        } else if (periods.length === 1) {
          // A single period is fully described by the flat fields, so the
          // rollover date moving means the schedule's start moves with it.
          await tx.subcategoryBudget.update({
            where: { id: periods[0].id },
            data: {
              amount: args.budgetAmount,
              ...(monthStart ? { validFrom: monthStart } : {}),
            },
          });
        } else {
          // With several, "where does accrual start" and "where does this
          // amount start" are different questions and this form only asks the
          // first, so the boundaries are left alone.
          await tx.subcategoryBudget.update({
            where: { id: periods[periods.length - 1].id },
            data: { amount: args.budgetAmount },
          });
        }

        await tx.subcategory.update({
          where: {
            id: args.id,
          },
          data: {
            categoryId: args.categoryId,
            name: args.name,
          },
        });

        // budgetAmount and rolloverDate come back off the schedule rather than
        // straight from the args, so the flat fields cannot drift away from the
        // periods that now define them.
        return syncSubcategoryToSchedule(tx, args.id);
      });
    }),
    setSubcategoryBudget: secured(async (_parent, args, context) => {
      const amountValidation = validatePositiveInteger(args.amount, "amount");
      if (!amountValidation.isValid) {
        throw new Error(
          `Amount validation failed: ${amountValidation.errors.join(", ")}`,
        );
      }

      const dateValidation = validateDate(args.validFrom, "validFrom");
      if (!dateValidation.isValid) {
        throw new Error(
          `Valid from validation failed: ${dateValidation.errors.join(", ")}`,
        );
      }

      const existingSubcategory = await context.prisma.subcategory.findUnique({
        where: { id: args.subcategoryId },
        include: { category: { select: { userId: true, groupId: true } } },
      });

      if (
        !existingSubcategory ||
        !canManage(
          existingSubcategory.category.userId,
          existingSubcategory.category,
          context,
        )
      ) {
        throw new Error("Subcategory not found or doesn't belong to user");
      }

      const validFrom = parseMonthStartUTC(args.validFrom);

      return await context.prisma.$transaction(async (tx) => {
        // Upsert rather than create: setting the same month twice is the user
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

        return syncSubcategoryToSchedule(tx, args.subcategoryId);
      });
    }),
    deleteSubcategoryBudget: secured(async (_parent, args, context) => {
      const dateValidation = validateDate(args.validFrom, "validFrom");
      if (!dateValidation.isValid) {
        throw new Error(
          `Valid from validation failed: ${dateValidation.errors.join(", ")}`,
        );
      }

      const existingSubcategory = await context.prisma.subcategory.findUnique({
        where: { id: args.subcategoryId },
        include: { category: { select: { userId: true, groupId: true } } },
      });

      if (
        !existingSubcategory ||
        !canManage(
          existingSubcategory.category.userId,
          existingSubcategory.category,
          context,
        )
      ) {
        throw new Error("Subcategory not found or doesn't belong to user");
      }

      const validFrom = parseMonthStartUTC(args.validFrom);

      return await context.prisma.$transaction(async (tx) => {
        const periods = await tx.subcategoryBudget.findMany({
          where: { subcategoryId: args.subcategoryId },
          orderBy: { validFrom: "asc" },
        });

        // Removing the last one would leave the subcategory with no budget in
        // any month, which the UI has no way to show and no way to undo.
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

        // Dropping the earliest period moves where the schedule opens, so the
        // sync is what keeps rolloverDate honest.
        return syncSubcategoryToSchedule(tx, args.subcategoryId);
      });
    }),
    deleteSubcategory: secured(
      async (_parent, args: { id: string }, context, _info) => {
        // Verify access via the parent category before deleting
        const existingSubcategory = await context.prisma.subcategory.findUnique(
          {
            where: { id: args.id },
            include: { category: { select: { userId: true, groupId: true } } },
          },
        );

        if (
          !existingSubcategory ||
          !canManage(
          existingSubcategory.category.userId,
          existingSubcategory.category,
          context
        )
        ) {
          notFoundError("Subcategory");
        }

        return await context.prisma.subcategory.delete({
          where: {
            id: args.id,
          },
        });
      },
    ),
  },
  Subcategory: {
    budgets: secured((parent, _args, context) =>
      context.loaders.subcategoryBudget.load(parent.id),
    ),
    expenses: secured((parent, args, context) => {
      const filterDate = args.filter.date;
      const filterDateRange = getFilterDateRange(filterDate);

      const expensesResponse = context.prisma.expense.findMany({
        where: {
          subcategoryId: parent.id,
          date: filterDateRange,
        },
        orderBy: {
          createdAt: "asc", // or 'desc' for descending order
        },
      });

      return expensesResponse;
    }),
  },
};
