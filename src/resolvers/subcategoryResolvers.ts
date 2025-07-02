import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

export const subcategoryResolvers = {
  Query: {
    subcategory: secured(async (parent, args, context) => {
      const subcategoryResponse = await context.prisma.subcategory.findFirst({
        where: { id: args.id },
      });

      if (!subcategoryResponse) {
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
        "budgetAmount"
      );
      if (!budgetValidation.isValid) {
        throw new Error(
          `Budget amount validation failed: ${budgetValidation.errors.join(
            ", "
          )}`
        );
      }

      const dateValidation = validateDate(args.rolloverDate, "rolloverDate");
      if (!dateValidation.isValid) {
        throw new Error(
          `Rollover date validation failed: ${dateValidation.errors.join(", ")}`
        );
      }

      // Verify category belongs to user
      const category = await context.prisma.category.findFirst({
        where: { id: args.categoryId, userId: context.currentUser.id },
      });

      if (!category) {
        throw new Error("Category not found or doesn't belong to user");
      }

      return await context.prisma.subcategory.create({
        data: {
          name: sanitizeString(args.name, 100),
          budgetAmount: args.budgetAmount,
          rolloverDate: new Date(args.rolloverDate).toISOString(),
          icon: args.icon ? sanitizeString(args.icon, 50) : "",
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
    deleteSubcategory: secured(
      async (_parent, args: { id: string }, context, _info) => {
        const deleteSubcategoryResponse =
          await context.prisma.subcategory.delete({
            where: {
              id: args.id,
            },
          });

        if (!deleteSubcategoryResponse) notFoundError("Subcategory");

        return deleteSubcategoryResponse;
      }
    ),
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
