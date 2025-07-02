// src/resolvers/__tests__/subcategoryResolvers.test.ts

import { subcategoryResolvers } from "../subcategoryResolvers";
import { getFilterDateRange } from "../../utils/getFilterDateRange";

describe("subcategoryResolvers", () => {
  // Include `email` so it matches the `User` type
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;

  let prismaMock: {
    subcategory: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    category: {
      findFirst: jest.Mock;
    };
    expense: {
      findMany: jest.Mock;
    };
  };
  let context: any;

  beforeEach(() => {
    prismaMock = {
      subcategory: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findFirst: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
    };

    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
    };
  });

  describe("Query.subcategory", () => {
    it("returns a subcategory when prisma.subcategory.findFirst resolves to an object", async () => {
      const fakeSub = { id: "sub-abc", name: "Test Sub" };
      prismaMock.subcategory.findFirst.mockResolvedValue(fakeSub);

      const args = { id: "sub-abc" };
      const result = await subcategoryResolvers.Query.subcategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.subcategory.findFirst).toHaveBeenCalledWith({
        where: { id: args.id },
      });
      expect(result).toBe(fakeSub);
    });

    it("throws notFoundError when prisma.subcategory.findFirst resolves to null", async () => {
      prismaMock.subcategory.findFirst.mockResolvedValue(null);
      const args = { id: "missing-sub" };

      await expect(
        subcategoryResolvers.Query.subcategory(null, args, context, dummyInfo)
      ).rejects.toThrowError(new Error("No such Subcategory found"));
    });
  });

  describe("Mutation.createSubcategory", () => {
    it("calls prisma.subcategory.create with correct data and returns the created record", async () => {
      const fakeCreated = {
        id: "new-sub",
        name: "NewSub",
        budgetAmount: 500,
        rolloverDate: "2022-08-01T00:00:00.000Z",
        icon: "",
        categoryId: "cat-123",
      };
      const fakeCategory = { id: "cat-123", name: "Test Category" };
      
      prismaMock.category.findFirst.mockResolvedValue(fakeCategory);
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
        dummyInfo
      );

      expect(prismaMock.subcategory.create).toHaveBeenCalledWith({
        data: {
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: new Date(args.rolloverDate).toISOString(),
          icon: "",
          category: { connect: { id: args.categoryId } },
        },
      });
      expect(result).toBe(fakeCreated);
    });
  });

  describe("Mutation.updateSubcategory", () => {
    it("calls prisma.subcategory.update with correct where/data and returns the updated record", async () => {
      const fakeUpdated = {
        id: "sub-xyz",
        name: "UpdatedSub",
        budgetAmount: 750,
        rolloverDate: "2022-09-01T00:00:00.000Z",
        categoryId: "cat-456",
      };
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
        dummyInfo
      );

      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          categoryId: args.categoryId,
          name: args.name,
          budgetAmount: args.budgetAmount,
          rolloverDate: new Date(args.rolloverDate).toISOString(),
        },
      });
      expect(result).toBe(fakeUpdated);
    });
  });

  describe("Mutation.deleteSubcategory", () => {
    it("calls prisma.subcategory.delete and returns the deleted record", async () => {
      const fakeDeleted = { id: "sub-del", name: "ToDelete" };
      prismaMock.subcategory.delete.mockResolvedValue(fakeDeleted);

      const args = { id: "sub-del" };
      const result = await subcategoryResolvers.Mutation.deleteSubcategory(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.subcategory.delete).toHaveBeenCalledWith({
        where: { id: args.id },
      });
      expect(result).toBe(fakeDeleted);
    });

    it("throws notFoundError when prisma.subcategory.delete resolves to null", async () => {
      prismaMock.subcategory.delete.mockResolvedValue(null);
      const args = { id: "missing-sub" };

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategory(
          null,
          args,
          context,
          dummyInfo
        )
      ).rejects.toThrowError(new Error("No such Subcategory found"));
    });
  });

  describe("Subcategory.expenses", () => {
    it("calls prisma.expense.findMany with correct where and orderBy, using getFilterDateRange", async () => {
      const filterDate = "2022-05-15";
      const { gte, lt } = getFilterDateRange(filterDate);

      const fakeExpenses = [{ id: "e1" }, { id: "e2" }];
      // Return a plain array; the secured wrapper is async, so `await` will unwrap it
      prismaMock.expense.findMany.mockReturnValue(fakeExpenses);

      const parent = { id: "sub-789" };
      const args = { filter: { date: filterDate } };
      const result = await subcategoryResolvers.Subcategory.expenses(
        parent,
        args,
        context,
        dummyInfo
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
