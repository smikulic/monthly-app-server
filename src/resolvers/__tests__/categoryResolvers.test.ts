// __tests__/categoryResolvers.test.ts
import { categoryResolvers } from "../categoryResolvers";

describe("categoryResolvers", () => {
  const dummyUser = { id: "user-123", email: "u@e.com", emailConfirmed: true };
  const dummyInfo = {} as any;
  let prismaMock: any;
  let context: any;

  beforeEach(() => {
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
      groups: [],
    };
  });

  describe("Query.categories", () => {
    it("defaults to ALL scope (personal + my groups)", async () => {
      const fakeCategories = [{ id: "cat1" }, { id: "cat2" }];
      prismaMock.category.findMany.mockResolvedValue(fakeCategories);

      const result = await categoryResolvers.Query.categories(
        null,
        {},
        context,
        dummyInfo,
      );

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { userId: dummyUser.id, groupId: null },
            { groupId: { in: [] } },
          ],
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(fakeCategories);
    });

    it("MINE scope queries only personal categories", async () => {
      prismaMock.category.findMany.mockResolvedValue([]);

      await categoryResolvers.Query.categories(
        null,
        { scope: "MINE" },
        context,
        dummyInfo,
      );

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { userId: dummyUser.id, groupId: null },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
    });

    it("GROUP scope queries that group when the caller is a member", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.category.findMany.mockResolvedValue([]);

      await categoryResolvers.Query.categories(
        null,
        { scope: "GROUP", groupId: "g1" },
        ctx,
        dummyInfo,
      );

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { groupId: "g1" },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
    });

    it("GROUP scope rejects a group the caller is not a member of", async () => {
      await expect(
        categoryResolvers.Query.categories(
          null,
          { scope: "GROUP", groupId: "not-mine" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("You are not a member of this group");
    });
  });

  describe("Query.category", () => {
    it("returns a personal category owned by the caller", async () => {
      const fakeCategory = {
        id: "cat-abc",
        name: "Test Cat",
        userId: dummyUser.id,
        groupId: null,
      };
      prismaMock.category.findUnique.mockResolvedValue(fakeCategory);

      const result = await categoryResolvers.Query.category(
        null,
        { id: "cat-abc" },
        context,
        dummyInfo,
      );

      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: "cat-abc" },
      });
      expect(result).toBe(fakeCategory);
    });

    it("returns a shared category when the caller is a group member", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      const fakeCategory = {
        id: "cat-shared",
        userId: "someone",
        groupId: "g1",
      };
      prismaMock.category.findUnique.mockResolvedValue(fakeCategory);

      const result = await categoryResolvers.Query.category(
        null,
        { id: "cat-shared" },
        ctx,
        dummyInfo,
      );

      expect(result).toBe(fakeCategory);
    });

    it("throws when the category is not found", async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        categoryResolvers.Query.category(
          null,
          { id: "missing-id" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Category not found or doesn't belong to user");
    });

    it("throws when the category belongs to another user (not shared with me)", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        id: "cat-x",
        userId: "another-user",
        groupId: null,
      });

      await expect(
        categoryResolvers.Query.category(
          null,
          { id: "cat-x" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Category not found or doesn't belong to user");
    });
  });

  describe("Mutation.createCategory", () => {
    it("creates a personal category and dedupes within my personal set", async () => {
      const fakeCreated = { id: "new-cat", name: "NewCat", icon: "" };
      prismaMock.category.findFirst.mockResolvedValue(null);
      prismaMock.category.create.mockResolvedValue(fakeCreated);

      const args = { name: "NewCat", icon: "test-icon" };
      const result = await categoryResolvers.Mutation.createCategory(
        null,
        args,
        context,
        dummyInfo,
      );

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: { name: "NewCat", userId: dummyUser.id, groupId: null },
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

    it("creates a category directly in a group the caller belongs to", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.category.findFirst.mockResolvedValue(null);
      prismaMock.category.create.mockResolvedValue({ id: "new" });

      await categoryResolvers.Mutation.createCategory(
        null,
        { name: "Shared", groupId: "g1" },
        ctx,
        dummyInfo,
      );

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: { name: "Shared", groupId: "g1" },
      });
      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: {
          name: "Shared",
          icon: "",
          user: { connect: { id: dummyUser.id } },
          group: { connect: { id: "g1" } },
        },
      });
    });

    it("rejects creating in a group the caller is not a member of", async () => {
      await expect(
        categoryResolvers.Mutation.createCategory(
          null,
          { name: "Shared", groupId: "nope" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("You are not a member of this group");
    });

    it("throws error for duplicate category name", async () => {
      prismaMock.category.findFirst.mockResolvedValue({ id: "existing" });

      await expect(
        categoryResolvers.Mutation.createCategory(
          null,
          { name: "NewCat" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("A category with this name already exists");
    });

    it("throws error for empty category name", async () => {
      await expect(
        categoryResolvers.Mutation.createCategory(
          null,
          { name: "" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Category name is required");
    });
  });

  describe("Mutation.updateCategory", () => {
    it("updates a category the caller can access", async () => {
      const fakeUpdated = { id: "cat-xyz", name: "UpdatedName" };
      prismaMock.category.findUnique.mockResolvedValue({
        userId: dummyUser.id,
        groupId: null,
      });
      prismaMock.category.findFirst.mockResolvedValue(null);
      prismaMock.category.update.mockResolvedValue(fakeUpdated);

      const args = { id: "cat-xyz", name: "UpdatedName" };
      const result = await categoryResolvers.Mutation.updateCategory(
        null,
        args,
        context,
        dummyInfo,
      );

      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: args.id },
        select: { userId: true, groupId: true },
      });
      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          name: "UpdatedName",
          userId: dummyUser.id,
          groupId: null,
          NOT: { id: args.id },
        },
      });
      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: { name: "UpdatedName", icon: undefined },
      });
      expect(result).toBe(fakeUpdated);
    });

    it("throws when the category is not accessible", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        userId: "another-user",
        groupId: null,
      });

      await expect(
        categoryResolvers.Mutation.updateCategory(
          null,
          { id: "cat-xyz", name: "X" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Category not found or doesn't belong to user");
    });
  });

  describe("Mutation.deleteCategory", () => {
    it("deletes a category the caller can access", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        userId: dummyUser.id,
        groupId: null,
      });
      prismaMock.category.delete.mockResolvedValue({ id: "cat-del" });

      const result = await categoryResolvers.Mutation.deleteCategory(
        null,
        { id: "cat-del" },
        context,
        dummyInfo,
      );

      expect(prismaMock.category.delete).toHaveBeenCalledWith({
        where: { id: "cat-del" },
      });
      expect(result).toEqual({ name: "cat-del" });
    });

    it("throws when the category is not accessible", async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        categoryResolvers.Mutation.deleteCategory(
          null,
          { id: "does-not-exist" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("No such Category found");
      expect(prismaMock.category.delete).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.shareCategory", () => {
    it("shares a category the caller owns with a group they belong to", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "OWNER" }] };
      prismaMock.category.findUnique.mockResolvedValue({
        userId: dummyUser.id,
      });
      prismaMock.category.update.mockResolvedValue({
        id: "cat1",
        groupId: "g1",
      });

      await categoryResolvers.Mutation.shareCategory(
        null,
        { categoryId: "cat1", groupId: "g1" },
        ctx,
        dummyInfo,
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: "cat1" },
        data: { group: { connect: { id: "g1" } } },
      });
    });

    it("rejects sharing a category the caller does not own", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "OWNER" }] };
      prismaMock.category.findUnique.mockResolvedValue({ userId: "other" });

      await expect(
        categoryResolvers.Mutation.shareCategory(
          null,
          { categoryId: "cat1", groupId: "g1" },
          ctx,
          dummyInfo,
        ),
      ).rejects.toThrow("Category not found or doesn't belong to user");
    });

    it("rejects sharing with a group the caller is not in", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        userId: dummyUser.id,
      });

      await expect(
        categoryResolvers.Mutation.shareCategory(
          null,
          { categoryId: "cat1", groupId: "nope" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("You are not a member of this group");
    });
  });

  describe("Mutation.unshareCategory", () => {
    it("returns a category to personal when the caller owns it", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        userId: dummyUser.id,
      });
      prismaMock.category.update.mockResolvedValue({
        id: "cat1",
        groupId: null,
      });

      await categoryResolvers.Mutation.unshareCategory(
        null,
        { categoryId: "cat1" },
        context,
        dummyInfo,
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: "cat1" },
        data: { group: { disconnect: true } },
      });
    });

    it("rejects unsharing a category the caller does not own", async () => {
      prismaMock.category.findUnique.mockResolvedValue({ userId: "other" });

      await expect(
        categoryResolvers.Mutation.unshareCategory(
          null,
          { categoryId: "cat1" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Category not found or doesn't belong to user");
    });
  });

  describe("Category.subcategories", () => {
    it("calls subcategory DataLoader with the category id and returns the result", async () => {
      const fakeSubs = [{ id: "sub1" }, { id: "sub2" }];
      context.loaders = {
        subcategory: { load: jest.fn().mockResolvedValue(fakeSubs) },
      };

      const parent = { id: "cat-123" };
      const result = await categoryResolvers.Category.subcategories(
        parent,
        {},
        context,
        dummyInfo,
      );

      expect(context.loaders.subcategory.load).toHaveBeenCalledWith(parent.id);
      expect(result).toBe(fakeSubs);
    });
  });
});
