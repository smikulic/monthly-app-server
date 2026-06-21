import { notFoundError } from "../utils/notFoundError.js";
import { secured } from "../utils/secured.js";
import { sanitizeString } from "../utils/validation.js";
import { categoryScopeWhere, canAccessCategory } from "../utils/scope.js";

export const categoryResolvers = {
  Query: {
    categories: secured((parent, args, context) => {
      return context.prisma.category.findMany({
        where: categoryScopeWhere(args, context),
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc", // or 'desc' for descending order
        },
      });
    }),
    category: secured(async (parent, args, context) => {
      const categoryResponse = await context.prisma.category.findUnique({
        where: { id: args.id },
      });

      if (!categoryResponse || !canAccessCategory(categoryResponse, context)) {
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
          "Category name is required and must be a non-empty string",
        );
      }

      if (args.name.length > 100) {
        throw new Error("Category name is too long (max 100 characters)");
      }

      // If creating directly in a group, the caller must be a member.
      if (args.groupId) {
        const isMember = context.groups.some((g) => g.groupId === args.groupId);
        if (!isMember) {
          throw new Error("You are not a member of this group");
        }
      }

      // Duplicate-name check within the same scope (a group, or my personal set).
      const duplicateWhere = args.groupId
        ? { name: args.name.trim(), groupId: args.groupId }
        : {
            name: args.name.trim(),
            userId: context.currentUser.id,
            groupId: null,
          };
      const existingCategory = await context.prisma.category.findFirst({
        where: duplicateWhere,
      });
      if (existingCategory) {
        throw new Error("A category with this name already exists");
      }

      return await context.prisma.category.create({
        data: {
          name: sanitizeString(args.name, 100),
          icon: args.icon ? sanitizeString(args.icon, 50) : "",
          user: { connect: { id: context.currentUser.id } },
          ...(args.groupId ? { group: { connect: { id: args.groupId } } } : {}),
        },
      });
    }),
    updateCategory: secured(async (parent, args, context) => {
      // Verify the caller can access the category (owner, or group member).
      const existingCategory = await context.prisma.category.findUnique({
        where: { id: args.id },
        select: { userId: true, groupId: true },
      });

      if (!existingCategory || !canAccessCategory(existingCategory, context)) {
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

        // Check for duplicate names within the same scope (excluding this one).
        const duplicateWhere = existingCategory.groupId
          ? {
              name: args.name.trim(),
              groupId: existingCategory.groupId,
              NOT: { id: args.id },
            }
          : {
              name: args.name.trim(),
              userId: context.currentUser.id,
              groupId: null,
              NOT: { id: args.id },
            };
        const duplicateCategory = await context.prisma.category.findFirst({
          where: duplicateWhere,
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
        const category = await context.prisma.category.findUnique({
          where: { id: args.id },
          select: { userId: true, groupId: true },
        });

        if (!category || !canAccessCategory(category, context)) {
          throw notFoundError("Category");
        }

        await context.prisma.category.delete({ where: { id: args.id } });

        return { name: args.id };
      },
    ),
    shareCategory: secured(async (_parent, args, context) => {
      // Only the creator can share their own category.
      const category = await context.prisma.category.findUnique({
        where: { id: args.categoryId },
        select: { userId: true },
      });
      if (!category || category.userId !== context.currentUser.id) {
        throw new Error("Category not found or doesn't belong to user");
      }

      const isMember = context.groups.some((g) => g.groupId === args.groupId);
      if (!isMember) {
        throw new Error("You are not a member of this group");
      }

      return context.prisma.category.update({
        where: { id: args.categoryId },
        data: { group: { connect: { id: args.groupId } } },
      });
    }),
    unshareCategory: secured(async (_parent, args, context) => {
      // Only the creator can return a category to personal.
      const category = await context.prisma.category.findUnique({
        where: { id: args.categoryId },
        select: { userId: true },
      });
      if (!category || category.userId !== context.currentUser.id) {
        throw new Error("Category not found or doesn't belong to user");
      }

      return context.prisma.category.update({
        where: { id: args.categoryId },
        data: { group: { disconnect: true } },
      });
    }),
  },
  Category: {
    subcategories: secured((parent, args, context) => {
      // use DataLoader instead of separate Prisma call per category
      return context.loaders.subcategory.load(parent.id);
    }),
  },
};
