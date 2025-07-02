import { notFoundError } from "../utils/notFoundError.js";
import { secured } from "../utils/secured.js";
import { sanitizeString } from "../utils/validation.js";

export const categoryResolvers = {
  Query: {
    categories: secured((parent, args, context) => {
      const categoriesResponse = context.prisma.category.findMany({
        where: { userId: context.currentUser.id },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc", // or 'desc' for descending order
        },
      });
      return categoriesResponse;
    }),
    category: secured(async (parent, args, context) => {
      const categoryResponse = await context.prisma.category.findFirst({
        where: {
          id: args.id,
          userId: context.currentUser.id, // Ensure user can only access their own categories
        },
      });

      if (!categoryResponse) {
        throw new Error("Category not found or doesn't belong to user");
      }

      return categoryResponse;
    }),
  },
  Mutation: {
    createCategory: secured(async (parent, args, context) => {
      // Validate name
      if (
        !args.name ||
        typeof args.name !== "string" ||
        args.name.trim().length === 0
      ) {
        throw new Error(
          "Category name is required and must be a non-empty string"
        );
      }

      if (args.name.length > 100) {
        throw new Error("Category name is too long (max 100 characters)");
      }

      // Check for duplicate category names for this user
      const existingCategory = await context.prisma.category.findFirst({
        where: {
          name: args.name.trim(),
          userId: context.currentUser.id,
        },
      });

      if (existingCategory) {
        throw new Error("A category with this name already exists");
      }

      return await context.prisma.category.create({
        data: {
          name: sanitizeString(args.name, 100),
          icon: args.icon ? sanitizeString(args.icon, 50) : "",
          user: { connect: { id: context.currentUser.id } },
        },
      });
    }),
    updateCategory: secured(async (parent, args, context) => {
      // Verify category belongs to user
      const existingCategory = await context.prisma.category.findUnique({
        where: { id: args.id },
        select: { userId: true, name: true },
      });

      if (
        !existingCategory ||
        existingCategory.userId !== context.currentUser.id
      ) {
        throw new Error("Category not found or doesn't belong to user");
      }

      // Validate name if provided
      if (args.name !== undefined) {
        if (
          !args.name ||
          typeof args.name !== "string" ||
          args.name.trim().length === 0
        ) {
          throw new Error("Category name must be a non-empty string");
        }

        if (args.name.length > 100) {
          throw new Error("Category name is too long (max 100 characters)");
        }

        // Check for duplicate category names (excluding current category)
        const duplicateCategory = await context.prisma.category.findFirst({
          where: {
            name: args.name.trim(),
            userId: context.currentUser.id,
            NOT: { id: args.id },
          },
        });

        if (duplicateCategory) {
          throw new Error("A category with this name already exists");
        }
      }

      return await context.prisma.category.update({
        where: {
          id: args.id,
        },
        data: {
          name: args.name ? sanitizeString(args.name, 100) : undefined,
          icon: args.icon ? sanitizeString(args.icon, 50) : undefined,
        },
      });
    }),
    deleteCategory: secured(
      async (_parent, args: { id: string }, context, _info) => {
        const deletedCount = await context.prisma.category.deleteMany({
          where: {
            id: args.id,
            userId: context.currentUser.id,
          },
        });

        if (deletedCount.count === 0) {
          throw notFoundError("Category");
        }

        return { name: args.id };
      }
    ),
  },
  Category: {
    subcategories: secured((parent, args, context) => {
      const subcategoriesResponse = context.prisma.subcategory.findMany({
        where: { categoryId: parent.id },
        orderBy: {
          createdAt: "asc", // or 'desc' for descending order
        },
      });
      return subcategoriesResponse;
    }),
  },
};
