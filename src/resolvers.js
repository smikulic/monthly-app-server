import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { APP_SECRET } from "./auth";

const getFilterDateRange = (filterDate) => {
  const filterDateYear = new Date(filterDate).getFullYear();
  const filterDateMonth = new Date(filterDate).getMonth();
  const dateGreaterThanOrEqual = new Date(filterDateYear, filterDateMonth, 1);
  const dateLessThan = new Date(filterDateYear, filterDateMonth + 1, 1);

  return {
    gte: dateGreaterThanOrEqual,
    lt: dateLessThan,
  };
};

const User = {
  id: (parent, args, context, info) => parent.id,
  email: (parent) => parent.email,
};

const Category = {
  subcategories: (parent, args, context) => {
    const subcategoriesResponse = context.prisma.subcategory.findMany({
      where: { categoryId: parent.id },
    });
    return subcategoriesResponse;
  },
};
const Subcategory = {
  expenses: (parent, args, context) => {
    const filterDate = args.filter.date;
    const filterDateRange = getFilterDateRange(filterDate);

    const expensesResponse = context.prisma.expense.findMany({
      where: {
        subcategoryId: parent.id,
        date: filterDateRange,
      },
    });

    return expensesResponse;
  },
};

const Query = {
  users: (parent, args, context) => {
    return context.prisma.user.findMany({});
  },
  user: (parent, args, context) => {
    return context.prisma.user.findFirst({
      where: { id: args.id },
    });
  },
  me: (parent, args, context) => {
    if (context.currentUser === undefined) {
      throw new Error("Unauthenticated!");
    }

    return context.currentUser;
  },
  expenses: (parent, args, context) => {
    const filterDate = args.filter.date;
    const filterDateRange = getFilterDateRange(filterDate);

    const expensesResponse = context.prisma.expense.findMany({
      where: { userId: context.currentUser.id, date: filterDateRange },
      include: {
        user: true,
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
  categories: (parent, args, context) => {
    const categoriesResponse = context.prisma.category.findMany({
      where: { userId: context.currentUser.id },
      include: {
        user: true,
      },
    });
    return categoriesResponse;
  },
  category: (parent, args, context) => {
    const categoryResponse = context.prisma.category.findFirst({
      where: { id: args.id },
    });
    return categoryResponse;
  },
  subcategory: (parent, args, context) => {
    const subcategoryResponse = context.prisma.subcategory.findFirst({
      where: { id: args.id },
    });

    // let response;
    // console.log({ subcategoryResponse });
    // const getResult = async () => {
    //   return await subcategoryResponse;
    // };
    // getResult().then((result) => {
    //   console.log({ result });
    //   response = result;
    // });
    // console.log({ response });

    return subcategoryResponse;
  },
  // subcategory: async (parent, args, context) => {
  //   const subcategoryResponse = await context.prisma.subcategory.findFirst({
  //     where: { id: args.id },
  //   });

  //   // Check if subcategoryResponse is null or undefined
  //   if (!subcategoryResponse) {
  //     return null;
  //   }

  //   subcategoryResponse.createdAt = subcategoryResponse.createdAt.toString();

  //   return subcategoryResponse;
  // },
};

const Mutation = {
  signup: async (parent, args, context) => {
    const password = await bcrypt.hash(args.password, 10);

    const user = await context.prisma.user.create({
      data: { ...args, password },
    });

    const token = jwt.sign({ userId: user.id }, APP_SECRET);

    return {
      token,
      user,
    };
  },
  login: async (parent, args, context) => {
    const user = await context.prisma.user.findUnique({
      where: { email: args.email },
    });
    if (!user) {
      throw new Error("No such user found");
    }

    const valid = await bcrypt.compare(args.password, user.password);
    if (!valid) {
      throw new Error("Invalid password");
    }

    const token = jwt.sign({ userId: user.id }, APP_SECRET);

    return {
      token,
      user,
    };
  },
  createCategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
    return await context.prisma.category.create({
      data: {
        name: args.name,
        icon: args.icon || "",
        user: { connect: { id: context.currentUser.id } },
      },
    });
  },
  updateCategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
    return await context.prisma.category.update({
      where: {
        id: args.id,
      },
      data: {
        name: args.name,
      },
    });
  },
  deleteCategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }

    const deleteCategoryResponse = await context.prisma.category.delete({
      where: {
        id: args.id,
      },
    });

    if (!deleteCategoryResponse) {
      throw new Error("No such category found");
    }

    return deleteCategoryResponse;
  },
  createSubcategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
    return await context.prisma.subcategory.create({
      data: {
        name: args.name,
        budgetAmount: args.budgetAmount,
        icon: args.icon || "",
        category: { connect: { id: args.categoryId } },
      },
    });
  },
  updateSubcategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
    return await context.prisma.subcategory.update({
      where: {
        id: args.id,
      },
      data: {
        name: args.name,
        budgetAmount: args.budgetAmount,
      },
    });
  },
  deleteSubcategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }

    const deleteSubcategoryResponse = await context.prisma.subcategory.delete({
      where: {
        id: args.id,
      },
    });

    if (!deleteSubcategoryResponse) {
      throw new Error("No such subcategory found");
    }

    return deleteSubcategoryResponse;
  },
  createExpense: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
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
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
    return await context.prisma.expense.update({
      where: {
        id: args.id,
      },
      data: {
        amount: args.amount,
        date: new Date(args.date).toISOString(),
      },
    });
  },
  deleteExpense: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }

    const deleteExpenseResponse = await context.prisma.expense.delete({
      where: {
        id: args.id,
      },
    });

    if (!deleteExpenseResponse) {
      throw new Error("No such expense found");
    }

    return deleteExpenseResponse;
  },
  // createExpense: async (parent, args, context) => {
  //   if (context.currentUser === null) {
  //     throw new Error("Unauthenticated!");
  //   }
  //   return await context.prisma.expense.create({
  //     data: {
  //       name: args.name,
  //       icon: args.icon || "",
  //       user: { connect: { id: context.currentUser.id } },
  //     },
  //   });
  // },
};

export const resolvers = {
  User,
  Query,
  Mutation,
  Category,
  Subcategory,
};
