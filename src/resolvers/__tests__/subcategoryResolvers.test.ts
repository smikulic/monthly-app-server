// src/resolvers/__tests__/subcategoryResolvers.test.ts

import { subcategoryResolvers } from "../subcategoryResolvers";
import { getFilterDateRange } from "../../utils/getFilterDateRange";

describe("subcategoryResolvers", () => {
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;

  let prismaMock: {
    subcategory: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    category: {
      findUnique: jest.Mock;
    };
    expense: {
      findMany: jest.Mock;
    };
  };
  let context: any;

  // A category the dummy user owns personally.
  const ownedCategory = { userId: dummyUser.id, groupId: null };

  beforeEach(() => {
    prismaMock = {
      subcategory: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
    };

    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
      groups: [],
    };
  });

  describe("Query.subcategory", () => {
    it("returns a subcategory whose parent category the caller can access", async () => {
      const fakeSub = {
        id: "sub-abc",
        name: "Test Sub",
        category: ownedCategory,
      };
      prismaMock.subcategory.findUnique.mockResolvedValue(fakeSub);

      const result = await subcategoryResolvers.Query.subcategory(
        null,
        { id: "sub-abc" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategory.findUnique).toHaveBeenCalledWith({
        where: { id: "sub-abc" },
        include: { category: { select: { userId: true, groupId: true } } },
      });
      expect(result).toBe(fakeSub);
    });

    it("throws when the subcategory is not found", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Query.subcategory(
          null,
          { id: "missing-sub" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError(new Error("No such Subcategory found"));
    });

    it("throws when the parent category belongs to another user", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-x",
        category: { userId: "another-user", groupId: null },
      });

      await expect(
        subcategoryResolvers.Query.subcategory(
          null,
          { id: "sub-x" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError(new Error("No such Subcategory found"));
    });
  });

  describe("Mutation.createSubcategory", () => {
    it("creates a subcategory under a category the caller owns", async () => {
      const fakeCreated = { id: "new-sub" };
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.create.mockResolvedValue(fakeCreated);

      const args = {
        name: "NewSub",
        budgetAmount: 500,
        rolloverDate: "2022-08-01",
        icon: null,
        categoryId: "cat-123",
      };
      const result = await subcategoryResolvers.Mutation.createSubcategory(
        null,
        args,
        context,
        dummyInfo,
      );

      const [y, m, d] = args.rolloverDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.subcategory.create).toHaveBeenCalledWith({
        data: {
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: dateForStorage,
          icon: "",
          category: { connect: { id: args.categoryId } },
        },
      });
      expect(result).toBe(fakeCreated);
    });

    it("lets a group member create under a shared category", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.category.findUnique.mockResolvedValue({
        userId: "another-user",
        groupId: "g1",
      });
      prismaMock.subcategory.create.mockResolvedValue({ id: "s" });

      await subcategoryResolvers.Mutation.createSubcategory(
        null,
        {
          name: "Shared sub",
          budgetAmount: 100,
          rolloverDate: "2022-08-01",
          categoryId: "cat-shared",
        },
        ctx,
        dummyInfo,
      );

      expect(prismaMock.subcategory.create).toHaveBeenCalled();
    });

    it("rejects creating under a category the caller cannot access", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        userId: "another-user",
        groupId: null,
      });

      await expect(
        subcategoryResolvers.Mutation.createSubcategory(
          null,
          {
            name: "X",
            budgetAmount: 100,
            rolloverDate: "2022-08-01",
            categoryId: "not-mine",
          },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Category not found or doesn't belong to user");
      expect(prismaMock.subcategory.create).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.updateSubcategory", () => {
    it("updates a subcategory the caller can access", async () => {
      const fakeUpdated = { id: "sub-xyz" };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-xyz",
        category: ownedCategory,
      });
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.update.mockResolvedValue(fakeUpdated);

      const args = {
        id: "sub-xyz",
        name: "UpdatedSub",
        budgetAmount: 750,
        rolloverDate: "2022-09-01",
        categoryId: "cat-456",
      };
      const result = await subcategoryResolvers.Mutation.updateSubcategory(
        null,
        args,
        context,
        dummyInfo,
      );

      const [y, m, d] = args.rolloverDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          categoryId: args.categoryId,
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: dateForStorage,
        },
      });
      expect(result).toBe(fakeUpdated);
    });

    it("throws when the subcategory is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Mutation.updateSubcategory(
          null,
          {
            id: "someone-elses-sub",
            name: "X",
            budgetAmount: 1,
            rolloverDate: "2022-09-01",
            categoryId: "cat-456",
          },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategory.update).not.toHaveBeenCalled();
    });

    it("throws when the target category is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-xyz",
        category: ownedCategory,
      });
      prismaMock.category.findUnique.mockResolvedValue({
        userId: "another-user",
        groupId: null,
      });

      await expect(
        subcategoryResolvers.Mutation.updateSubcategory(
          null,
          {
            id: "sub-xyz",
            name: "X",
            budgetAmount: 1,
            rolloverDate: "2022-09-01",
            categoryId: "someone-elses-cat",
          },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Category not found or doesn't belong to user");
      expect(prismaMock.subcategory.update).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.deleteSubcategory", () => {
    it("deletes a subcategory the caller can access", async () => {
      const fakeDeleted = { id: "sub-del" };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-del",
        category: ownedCategory,
      });
      prismaMock.subcategory.delete.mockResolvedValue(fakeDeleted);

      const result = await subcategoryResolvers.Mutation.deleteSubcategory(
        null,
        { id: "sub-del" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategory.findUnique).toHaveBeenCalledWith({
        where: { id: "sub-del" },
        include: { category: { select: { userId: true, groupId: true } } },
      });
      expect(prismaMock.subcategory.delete).toHaveBeenCalledWith({
        where: { id: "sub-del" },
      });
      expect(result).toBe(fakeDeleted);
    });

    it("throws when the subcategory is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategory(
          null,
          { id: "missing-sub" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError(new Error("No such Subcategory found"));
      expect(prismaMock.subcategory.delete).not.toHaveBeenCalled();
    });
  });

  describe("Subcategory.expenses", () => {
    it("calls prisma.expense.findMany with correct where and orderBy", async () => {
      const filterDate = "2022-05-15";
      const { gte, lt } = getFilterDateRange(filterDate);

      const fakeExpenses = [{ id: "e1" }, { id: "e2" }];
      prismaMock.expense.findMany.mockReturnValue(fakeExpenses);

      const parent = { id: "sub-789" };
      const args = { filter: { date: filterDate } };
      const result = await subcategoryResolvers.Subcategory.expenses(
        parent,
        args,
        context,
        dummyInfo,
      );

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          subcategoryId: parent.id,
          date: { gte, lt },
        },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(fakeExpenses);
    });
  });
});
