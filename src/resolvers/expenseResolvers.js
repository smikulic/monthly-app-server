import OpenAI from "openai";
import {
  getFilterDateRange,
  ensureAuthenticated,
  notFoundError,
} from "../utils.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
          categoryName: sub.category.name,
          subcategoryName: sub.name,
          total: g._sum.amount || 0,
        };
      });

      return { monthlyTotals, categoryExpenseTotals };
    },
    yearlyInsight: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      const filterDate = args.filter.date;
      const filterDateYear = new Date(filterDate).getFullYear();

      const startDate = new Date(`${filterDateYear}-01-01`);
      const endDate = new Date(`${filterDateYear}-12-31`);

      // 2) Fetch all expenses in that year
      const expenses = await context.prisma.expense.findMany({
        where: {
          userId: context.currentUser.id,
          date: { gte: startDate, lte: endDate },
        },
        select: { amount: true, date: true, subcategoryId: true },
      });

      const total = expenses.reduce((sum, e) => sum + e.amount, 0);

      const monthlyTotals = Array(12).fill(0);
      expenses.forEach(({ date, amount }) => {
        monthlyTotals[date.getMonth()] += amount;
      });
      const forecastTotal = monthlyTotals.reduce((a, b) => a + b, 0);

      // 2) build a prompt with those figures
      const breakdownLines = await Promise.all(
        expenses.map(async (e) => {
          const sub = await context.prisma.subcategory.findUnique({
            where: { id: e.subcategoryId },
            include: { category: true },
          });
          return `– ${sub.category.name}/${sub.name}: ${e.amount}€`;
        })
      );

      const monthlyLine = monthlyTotals.map((m) => `${m}€`).join(", ");

      const yearlyPrompt = `
      You are a budgeting assistant. Here are the numbers for ${filterDateYear}:
      Total spent: ${total}€.
      Breakdown:
      ${breakdownLines.join("\n")}

            Write a 2–3 sentence summary highlighting the biggest over- or under-spends and any trends.
      `;

      const forecastPrompt = `
      You are a budgeting assistant. Given the data for ${filterDateYear}:
      • Monthly totals (Jan→Dec): ${monthlyLine}
      • Yearly total: ${forecastTotal}€
      Write a 2–3 sentence forecast for next year’s spending based on the current run rate (i.e. average monthly spending × 12) and call out any categories likely to exceed budget if trends continue.
            `.trim();

      console.log({ yearlyPrompt });

      // 3) call ChatGPT
      // const chat = await openai.chat.completions.create({
      //   model: "gpt-4.1-nano",
      //   store: true,
      //   messages: [{ role: "user", content: yearlyPrompt }],
      //   max_tokens: 150,
      //   temperature: 0.7,
      // });

      const [yearlyRes, forecastRes] = await Promise.all([
        openai.chat.completions.create({
          model: "gpt-4.1-nano",
          store: true,
          messages: [{ role: "user", content: yearlyPrompt }],
          max_tokens: 150,
          temperature: 0.7,
        }),
        openai.chat.completions.create({
          model: "gpt-4.1-nano",
          store: true,
          messages: [{ role: "user", content: forecastPrompt }],
          max_tokens: 150,
          temperature: 0.7,
        }),
      ]);

      const yearlyNarrative = yearlyRes.choices[0].message.content.trim();
      const forecastNarrative = forecastRes.choices[0].message.content.trim();
      // const narrative = chat.choices[0].message.content.trim();
      // console.log({ narrative });

      // 4) return both the narrative and the raw series if you want to chart it
      return {
        yearly: {
          title: `Yearly Summary: ${filterDateYear}`,
          narrative: yearlyNarrative,
          data: {},
        },
        forecast: {
          title: `Forecast for ${filterDateYear + 1}`,
          narrative: forecastNarrative,
          data: {},
        },
        // title: `Yearly Summary: ${filterDateYear}`,
        // narrative,
        // data: {
        //   total,
        //   breakdown: expenses.map((e, i) => ({
        //     label: breakdownLines[i].split(":")[0].replace("– ", ""),
        //     value: e.amount,
        //   })),
        // },
      };
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
