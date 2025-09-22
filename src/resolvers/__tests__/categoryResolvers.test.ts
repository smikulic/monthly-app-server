// __tests__/categoryResolvers.test.ts
import { categoryResolvers } from "../categoryResolvers";

describe("categoryResolvers", () => {
  const dummyUser = { id: "user-123", emailConfirmed: true };
  const dummyInfo = {} as any;
  let prismaMock: any;
  let context: any;

  beforeEach(() => {
    // Reset mocks before each test
    prismaMock = {
      category: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      subcategory: {
        findMany: jest.fn(),
      },
    };
    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
    };
  });

  describe("Query.categories", () => {
    it("calls prisma.category.findMany with the correct where clause and returns the result", async () => {
      const fakeCategories = [{ id: "cat1" }, { id: "cat2" }];
      prismaMock.category.findMany.mockResolvedValue(fakeCategories);

      // Because secured wraps, we must call through secured.
      const result = await categoryResolvers.Query.categories(
        null,
        {},
        context,
        dummyInfo
      );

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { userId: dummyUser.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(fakeCategories);
    });
  });

  describe("Query.category", () => {
    it("returns a category when prisma.category.findFirst finds one", async () => {
      const fakeCategory = { id: "cat-abc", name: "Test Cat" };
      prismaMock.category.findFirst.mockResolvedValue(fakeCategory);

      const args = { id: "cat-abc" };
      const result = await categoryResolvers.Query.category(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: args.id,
          userId: dummyUser.id,
        },
      });
      expect(result).toBe(fakeCategory);
    });

    it("throws error when category not found or doesn't belong to user", async () => {
      prismaMock.category.findFirst.mockResolvedValue(null);

      const args = { id: "missing-id" };

      await expect(
        categoryResolvers.Query.category(null, args, context, dummyInfo)
      ).rejects.toThrow("Category not found or doesn't belong to user");
    });
  });

  describe("Mutation.createCategory", () => {
    it("calls prisma.category.create with the correct data and returns the created record", async () => {
      const fakeCreated = { id: "new-cat", name: "NewCat", icon: "" };
      prismaMock.category.findFirst.mockResolvedValue(null); // No duplicate
      prismaMock.category.create.mockResolvedValue(fakeCreated);

      const args = { name: "NewCat", icon: "test-icon" };
      const result = await categoryResolvers.Mutation.createCategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          name: "NewCat",
          userId: dummyUser.id,
        },
      });
      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: {
          name: "NewCat",
          icon: "test-icon",
          user: { connect: { id: dummyUser.id } },
        },
      });
      expect(result).toBe(fakeCreated);
    });

    it("throws error for duplicate category name", async () => {
      const existingCategory = { id: "existing", name: "NewCat" };
      prismaMock.category.findFirst.mockResolvedValue(existingCategory);

      const args = { name: "NewCat" };

      await expect(
        categoryResolvers.Mutation.createCategory(
          null,
          args,
          context,
          dummyInfo
        )
      ).rejects.toThrow("A category with this name already exists");
    });

    it("throws error for empty category name", async () => {
      const args = { name: "" };

      await expect(
        categoryResolvers.Mutation.createCategory(
          null,
          args,
          context,
          dummyInfo
        )
      ).rejects.toThrow("Category name is required");
    });
  });

  describe("Mutation.updateCategory", () => {
    it("calls prisma.category.update with the correct where/data and returns the updated record", async () => {
      const fakeUpdated = { id: "cat-xyz", name: "UpdatedName" };
      const existingCategory = { userId: dummyUser.id, name: "OldName" };

      prismaMock.category.findUnique.mockResolvedValue(existingCategory);
      prismaMock.category.findFirst.mockResolvedValue(null); // No duplicate
      prismaMock.category.update.mockResolvedValue(fakeUpdated);

      const args = { id: "cat-xyz", name: "UpdatedName" };
      const result = await categoryResolvers.Mutation.updateCategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: args.id },
        select: { userId: true, name: true },
      });
      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          name: "UpdatedName",
          icon: undefined,
        },
      });
      expect(result).toBe(fakeUpdated);
    });
  });

  describe("Mutation.deleteCategory", () => {
    it("calls prisma.category.deleteMany and returns confirmation", async () => {
      const deleteResult = { count: 1 };
      prismaMock.category.deleteMany.mockResolvedValue(deleteResult);

      const args = { id: "cat-del" };
      const result = await categoryResolvers.Mutation.deleteCategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.deleteMany).toHaveBeenCalledWith({
        where: {
          id: args.id,
          userId: dummyUser.id,
        },
      });
      expect(result).toEqual({ name: args.id });
    });

    it("throws error when category doesn't belong to user", async () => {
      const deleteResult = { count: 0 };
      prismaMock.category.deleteMany.mockResolvedValue(deleteResult);

      const args = { id: "does-not-exist" };

      await expect(
        categoryResolvers.Mutation.deleteCategory(
          null,
          args,
          context,
          dummyInfo
        )
      ).rejects.toThrow("No such Category found");
    });
  });

  describe("Category.subcategories", () => {
    // it("calls prisma.subcategory.findMany with the correct where/orderBy and returns the result", async () => {
    //   const fakeSubs = [{ id: "sub1" }, { id: "sub2" }];
    //   prismaMock.subcategory.findMany.mockResolvedValue(fakeSubs);

    //   const parent = { id: "cat-123" };
    //   const result = await categoryResolvers.Category.subcategories(
    //     parent,
    //     {},
    //     context,
    //     dummyInfo
    //   );

    //   expect(prismaMock.subcategory.findMany).toHaveBeenCalledWith({
    //     where: { categoryId: parent.id },
    //     orderBy: { createdAt: "asc" },
    //   });
    //   expect(result).toBe(fakeSubs);
    // });
    it("calls subcategory DataLoader with the category id and returns the result", async () => {
      const fakeSubs = [{ id: "sub1" }, { id: "sub2" }];

      // Mock the DataLoader in context
      context.loaders = {
        subcategory: { load: jest.fn().mockResolvedValue(fakeSubs) },
      };

      const parent = { id: "cat-123" };
      const result = await categoryResolvers.Category.subcategories(
        parent,
        {},
        context,
        dummyInfo
      );

      // Check that DataLoader.load was called with the categoryId
      expect(context.loaders.subcategory.load).toHaveBeenCalledWith(parent.id);

      // Check that the return value is what the DataLoader resolved
      expect(result).toBe(fakeSubs);
    });
  });
});
