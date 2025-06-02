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
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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
        where: { id: args.id },
      });
      expect(result).toBe(fakeCategory);
    });

    it("throws notFoundError when prisma.category.findFirst returns null", async () => {
      prismaMock.category.findFirst.mockResolvedValue(null);

      const args = { id: "missing-id" };

      await expect(
        categoryResolvers.Query.category(null, args, context, dummyInfo)
      ).rejects.toThrowError(new Error("No such Category found"));
    });
  });

  describe("Mutation.createCategory", () => {
    it("calls prisma.category.create with the correct data and returns the created record", async () => {
      const fakeCreated = { id: "new-cat", name: "NewCat", icon: "" };
      prismaMock.category.create.mockResolvedValue(fakeCreated);

      const args = { name: "NewCat", icon: null };
      const result = await categoryResolvers.Mutation.createCategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: {
          name: args.name,
          icon: "",
          user: { connect: { id: dummyUser.id } },
        },
      });
      expect(result).toBe(fakeCreated);
    });
  });

  describe("Mutation.updateCategory", () => {
    it("calls prisma.category.update with the correct where/data and returns the updated record", async () => {
      const fakeUpdated = { id: "cat-xyz", name: "UpdatedName" };
      prismaMock.category.update.mockResolvedValue(fakeUpdated);

      const args = { id: "cat-xyz", name: "UpdatedName" };
      const result = await categoryResolvers.Mutation.updateCategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: { name: args.name },
      });
      expect(result).toBe(fakeUpdated);
    });
  });

  describe("Mutation.deleteCategory", () => {
    it("calls prisma.category.delete and returns the deleted record", async () => {
      const fakeDeleted = { id: "cat-del", name: "ToDelete" };
      prismaMock.category.delete.mockResolvedValue(fakeDeleted);

      const args = { id: "cat-del" };
      const result = await categoryResolvers.Mutation.deleteCategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.category.delete).toHaveBeenCalledWith({
        where: { id: args.id },
      });
      expect(result).toBe(fakeDeleted);
    });

    it("throws notFoundError when prisma.category.delete returns null", async () => {
      prismaMock.category.delete.mockResolvedValue(null);

      const args = { id: "does-not-exist" };

      await expect(
        categoryResolvers.Mutation.deleteCategory(
          null,
          args,
          context,
          dummyInfo
        )
      ).rejects.toThrowError(new Error("No such Category found"));
    });
  });

  describe("Category.subcategories", () => {
    it("calls prisma.subcategory.findMany with the correct where/orderBy and returns the result", async () => {
      const fakeSubs = [{ id: "sub1" }, { id: "sub2" }];
      prismaMock.subcategory.findMany.mockResolvedValue(fakeSubs);

      const parent = { id: "cat-123" };
      const result = await categoryResolvers.Category.subcategories(
        parent,
        {},
        context,
        dummyInfo
      );

      expect(prismaMock.subcategory.findMany).toHaveBeenCalledWith({
        where: { categoryId: parent.id },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(fakeSubs);
    });
  });
});
