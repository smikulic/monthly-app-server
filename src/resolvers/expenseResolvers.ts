import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

export const expenseResolvers = {
  Query: {
    expenses: secured((parent, args, context) => {
      // Build the base where clause with the user id.
      const whereClause: any = { userId: context.currentUser.id };

      // Check if args.filter exists and contains a date.
      if (args.filter && args.filter.date) {
        const filterDateRange = getFilterDateRange(args.filter.date);
        // Append the date filter only if a date is provided.
        whereClause.date = filterDateRange;
      }

      // Return expenses using the dynamically built filter.
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

      const expensesResponse = await context.prisma.expense.findMany({
        where: {
          userId: context.currentUser.id,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        // include: {
        //   user: true,
        // },
        select: {
          amount: true,
          date: true,
          subcategoryId: true,
        },
      });

      // Initialize an array of 12 zeros (for each month's total expenses).
      const monthlyTotals = new Array(12).fill(0);

      expensesResponse.forEach((expense) => {
        const month = expense.date.getMonth(); // getMonth() returns a zero-based index.
        monthlyTotals[month] += expense.amount;
      });

      // do a prisma.groupBy to get sums per subcategory
      const grouped = await context.prisma.expense.groupBy({
        by: ["subcategoryId"],
        where: {
          userId: context.currentUser.id,
          date: { gte: startDate, lte: endDate },
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

      return { monthlyTotals, categoryExpenseTotals };
    }),
  },
  Mutation: {
    createExpense: secured(async (parent, args, context) => {
      // Validate amount
      const amountValidation = validatePositiveInteger(args.amount, "amount");
      if (!amountValidation.isValid) {
        throw new Error(
          `Amount validation failed: ${amountValidation.errors.join(", ")}`
        );
      }

      // Validate date
      const dateValidation = validateDate(args.date, "date");
      if (!dateValidation.isValid) {
        throw new Error(
          `Date validation failed: ${dateValidation.errors.join(", ")}`
        );
      }

      // Validate subcategoryId exists
      if (!args.subcategoryId || typeof args.subcategoryId !== "string") {
        throw new Error(
          "Subcategory ID is required and must be a valid string"
        );
      }

      // Verify subcategory belongs to user
      const subcategory = await context.prisma.subcategory.findFirst({
        where: {
          id: args.subcategoryId,
          category: { userId: context.currentUser.id },
        },
      });

      if (!subcategory) {
        throw new Error("Subcategory not found or doesn't belong to user");
      }

      return await context.prisma.expense.create({
        data: {
          amount: args.amount,
          description: args.description
            ? sanitizeString(args.description, 255)
            : null,
          date: new Date(args.date).toISOString(),
          user: { connect: { id: context.currentUser.id } },
          subcategory: { connect: { id: args.subcategoryId } },
        },
      });
    }),
    updateExpense: secured(async (parent, args, context) => {
      // Validate expense belongs to user
      const existingExpense = await context.prisma.expense.findUnique({
        where: { id: args.id },
        select: { userId: true },
      });

      if (
        !existingExpense ||
        existingExpense.userId !== context.currentUser.id
      ) {
        throw new Error("Expense not found or doesn't belong to user");
      }

      // Validate amount if provided
      if (args.amount !== undefined) {
        const amountValidation = validatePositiveInteger(args.amount, "amount");
        if (!amountValidation.isValid) {
          throw new Error(
            `Amount validation failed: ${amountValidation.errors.join(", ")}`
          );
        }
      }

      // Validate date if provided
      if (args.date !== undefined) {
        const dateValidation = validateDate(args.date, "date");
        if (!dateValidation.isValid) {
          throw new Error(
            `Date validation failed: ${dateValidation.errors.join(", ")}`
          );
        }
      }

      // Validate subcategory if provided
      if (args.subcategoryId !== undefined) {
        if (!args.subcategoryId || typeof args.subcategoryId !== "string") {
          throw new Error("Subcategory ID must be a valid string");
        }

        const subcategory = await context.prisma.subcategory.findFirst({
          where: {
            id: args.subcategoryId,
            category: { userId: context.currentUser.id },
          },
        });

        if (!subcategory) {
          throw new Error("Subcategory not found or doesn't belong to user");
        }
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
          date: args.date ? new Date(args.date).toISOString() : undefined,
          subcategory: args.subcategoryId
            ? { connect: { id: args.subcategoryId } }
            : undefined,
        },
      });
    }),
    deleteExpense: secured(async (parent, args, context) => {
      // Use deleteMany to ensure user can only delete their own expenses
      const deleteResult = await context.prisma.expense.deleteMany({
        where: {
          id: args.id,
          userId: context.currentUser.id,
        },
      });

      if (deleteResult.count === 0) {
        notFoundError("Expense");
      }

      return { id: args.id }; // Return minimal data for confirmation
    }),
  },
};
