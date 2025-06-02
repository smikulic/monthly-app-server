import { notFoundError } from "../utils/notFoundError";
import { secured } from "../utils/secured";

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
    category: secured((parent, args, context) => {
      const categoryResponse = context.prisma.category.findFirst({
        where: { id: args.id },
      });

      if (!categoryResponse) notFoundError("Category");

      return categoryResponse;
    }),
  },
  Mutation: {
    createCategory: secured(async (parent, args, context) => {
      return await context.prisma.category.create({
        data: {
          name: args.name,
          icon: args.icon || "",
          user: { connect: { id: context.currentUser.id } },
        },
      });
    }),
    updateCategory: secured(async (parent, args, context) => {
      return await context.prisma.category.update({
        where: {
          id: args.id,
        },
        data: {
          name: args.name,
        },
      });
    }),
    deleteCategory: secured(async (parent, args, context) => {
      const deleteCategoryResponse = await context.prisma.category.delete({
        where: {
          id: args.id,
        },
      });

      if (!deleteCategoryResponse) notFoundError("Category");

      return deleteCategoryResponse;
    }),
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
