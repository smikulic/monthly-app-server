import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";

export const subcategoryResolvers = {
  Query: {
    subcategory: secured((parent, args, context) => {
      const subcategoryResponse = context.prisma.subcategory.findFirst({
        where: { id: args.id },
      });

      if (!subcategoryResponse) notFoundError("Subcategory");

      return subcategoryResponse;
    }),
  },
  Mutation: {
    createSubcategory: secured(async (parent, args, context) => {
      return await context.prisma.subcategory.create({
        data: {
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: new Date(args.rolloverDate).toISOString(),
          icon: args.icon || "",
          category: { connect: { id: args.categoryId } },
        },
      });
    }),
    updateSubcategory: secured(async (parent, args, context) => {
      return await context.prisma.subcategory.update({
        where: {
          id: args.id,
        },
        data: {
          categoryId: args.categoryId,
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: new Date(args.rolloverDate).toISOString(),
        },
      });
    }),
    deleteSubcategory: secured(async (parent, args, context) => {
      const deleteSubcategoryResponse = await context.prisma.subcategory.delete(
        {
          where: {
            id: args.id,
          },
        }
      );

      if (!deleteSubcategoryResponse) notFoundError("Subcategory");

      return deleteSubcategoryResponse;
    }),
  },
  Subcategory: {
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
