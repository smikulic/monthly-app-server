import {
  getFilterDateRange,
  ensureAuthenticated,
  notFoundError,
} from "../utils";

export const expenseResolvers = {
  Query: {
    expenses: (parent, args, context) => {
      // const filterDate = args.filter.date;
      // const filterDateRange = getFilterDateRange(filterDate);

      // const expensesResponse = context.prisma.expense.findMany({
      //   where: { userId: context.currentUser.id, date: filterDateRange },
      //   include: {
      //     user: true,
      //   },
      //   orderBy: {
      //     date: "asc", // or 'desc' for descending order
      //   },
      // });

      // Build the base where clause with the user id.
      const whereClause = { userId: context.currentUser.id };

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
    },
    chartExpenses: async (parent, args, context) => {
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
        include: {
          user: true,
        },
      });

      // Initialize an array of 12 zeros (for each month's total expenses).
      const monthlyTotals = new Array(12).fill(0);

      expensesResponse.forEach((expense) => {
        const month = expense.date.getMonth(); // getMonth() returns a zero-based index.
        monthlyTotals[month] += expense.amount;
      });

      return monthlyTotals;
    },
  },
  Mutation: {
    createExpense: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      return await context.prisma.expense.create({
        data: {
          amount: args.amount,
          date: new Date(args.date).toISOString(),
          user: { connect: { id: context.currentUser.id } },
          subcategory: { connect: { id: args.subcategoryId } },
        },
      });
    },
    updateExpense: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      return await context.prisma.expense.update({
        where: {
          id: args.id,
        },
        data: {
          amount: args.amount,
          date: new Date(args.date).toISOString(),
          subcategory: { connect: { id: args.subcategoryId } },
        },
      });
    },
    deleteExpense: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      const deleteExpenseResponse = await context.prisma.expense.delete({
        where: {
          id: args.id,
        },
      });

      if (!deleteExpenseResponse) notFoundError("Expense");

      return deleteExpenseResponse;
    },
  },
};
