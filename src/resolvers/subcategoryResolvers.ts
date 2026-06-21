import { notFoundError } from "../utils/notFoundError.js";
import { getFilterDateRange } from "../utils/getFilterDateRange.js";
import { secured } from "../utils/secured.js";
import { canAccessCategory } from "../utils/scope.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

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

      return await context.prisma.subcategory.create({
        data: {
          name: sanitizeString(args.name, 100),
          budgetAmount: args.budgetAmount,
          rolloverDate: dateForStorage,
          icon: args.icon ? sanitizeString(args.icon, 50) : "",
          category: { connect: { id: args.categoryId } },
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
        !canAccessCategory(existingSubcategory.category, context)
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

      const [y, m, d] = args.rolloverDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      return await context.prisma.subcategory.update({
        where: {
          id: args.id,
        },
        data: {
          categoryId: args.categoryId,
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: dateForStorage,
        },
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
          !canAccessCategory(existingSubcategory.category, context)
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
