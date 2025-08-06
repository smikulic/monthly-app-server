// src/resolvers/__tests__/expenseResolvers.test.ts

import { expenseResolvers } from "../expenseResolvers";
import { getFilterDateRange } from "../../utils/getFilterDateRange";

describe("expenseResolvers", () => {
  // Include `email` so the `User` type is satisfied
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;

  let prismaMock: {
    expense: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
    };
    subcategory: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let context: any;

  beforeEach(() => {
    prismaMock = {
      expense: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
      },
      subcategory: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
    };
  });

  describe("Query.expenses", () => {
    it("calls prisma.expense.findMany without date filter when args.filter is absent", async () => {
      const fakeExpenses = [{ id: "e1" }, { id: "e2" }];
      prismaMock.expense.findMany.mockReturnValue(fakeExpenses);

      const args: any = {};
      const result = await expenseResolvers.Query.expenses(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: { userId: dummyUser.id },
        include: { user: true },
        orderBy: { date: "asc" },
      });
      expect(result).toBe(fakeExpenses);
    });

    it("calls prisma.expense.findMany with date filter when args.filter.date is provided", async () => {
      const filterDate = "2022-06-15";
      const { gte, lt } = getFilterDateRange(filterDate);
      const fakeExpenses = [{ id: "e3" }, { id: "e4" }];
      prismaMock.expense.findMany.mockReturnValue(fakeExpenses);

      const args: any = { filter: { date: filterDate } };
      const result = await expenseResolvers.Query.expenses(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          userId: dummyUser.id,
          date: { gte, lt },
        },
        include: { user: true },
        orderBy: { date: "asc" },
      });
      expect(result).toBe(fakeExpenses);
    });
  });

  describe("Query.chartExpenses", () => {
    it("computes monthlyTotals and categoryExpenseTotals correctly", async () => {
      // filterDateYear = 2022
      const filterDate = "2022-03-10";
      // Expenses across months:
      const expenseRecords = [
        { amount: 100, date: new Date("2022-01-05"), subcategoryId: "sub1" },
        { amount: 50, date: new Date("2022-01-20"), subcategoryId: "sub1" },
        { amount: 200, date: new Date("2022-02-15"), subcategoryId: "sub2" },
        { amount: 300, date: new Date("2022-03-01"), subcategoryId: "sub1" },
      ];
      // groupBy sums per subcategory:
      const groupByResult = [
        { subcategoryId: "sub1", _sum: { amount: 450 } }, // 100+50+300
        { subcategoryId: "sub2", _sum: { amount: 200 } }, // 200
      ];
      // subcategories fetched (with their parent category names):
      const subcats = [
        { id: "sub1", name: "Sub One", category: { name: "Cat A" } },
        { id: "sub2", name: "Sub Two", category: { name: "Cat B" } },
      ];

      // Mock prisma calls:
      prismaMock.expense.findMany.mockResolvedValue(expenseRecords);
      prismaMock.expense.groupBy.mockResolvedValue(groupByResult);
      prismaMock.subcategory.findMany.mockResolvedValue(subcats);

      const args: any = { filter: { date: filterDate } };
      const result = await expenseResolvers.Query.chartExpenses(
        null,
        args,
        context,
        dummyInfo
      );

      // monthlyTotals: index 0 (Jan) = 150, index 1 (Feb) = 200, index 2 (Mar) = 300, rest 0
      const expectedMonthly = [
        150, // Jan
        200, // Feb
        300, // Mar
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ];
      expect(result.monthlyTotals).toEqual(expectedMonthly);

      // categoryExpenseTotals: match groupBy with subcats
      const expectedCategoryTotals = [
        { categoryName: "Cat A", subcategoryName: "Sub One", total: 450 },
        { categoryName: "Cat B", subcategoryName: "Sub Two", total: 200 },
      ];
      expect(result.categoryExpenseTotals).toEqual(expectedCategoryTotals);

      // Also verify prisma calls used correct date range
      const year = new Date(filterDate).getFullYear();
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          userId: dummyUser.id,
          date: { gte: startDate, lte: endDate },
        },
        select: { amount: true, date: true, subcategoryId: true },
      });
      expect(prismaMock.expense.groupBy).toHaveBeenCalledWith({
        by: ["subcategoryId"],
        where: {
          userId: dummyUser.id,
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      });
      expect(prismaMock.subcategory.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["sub1", "sub2"] } },
        include: { category: true },
      });
    });
  });

  describe("Mutation.createExpense", () => {
    it("calls prisma.expense.create with correct data and returns the created record", async () => {
      const fakeCreated = {
        id: "exp1",
        amount: 123,
        date: "2022-07-01T00:00:00.000Z",
        subcategoryId: "sub-456",
        userId: dummyUser.id,
      };
      const fakeSubcategory = {
        id: "sub-456",
        name: "Test Subcategory",
      };

      prismaMock.subcategory.findFirst.mockResolvedValue(fakeSubcategory);
      prismaMock.expense.create.mockResolvedValue(fakeCreated);

      const args = {
        amount: 123,
        date: "2022-07-01",
        subcategoryId: "sub-456",
        description: "Test expense",
      };
      const result = await expenseResolvers.Mutation.createExpense(
        null,
        args,
        context,
        dummyInfo
      );

      const [y, m, d] = args.date.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.subcategory.findFirst).toHaveBeenCalledWith({
        where: {
          id: args.subcategoryId,
          category: { userId: dummyUser.id },
        },
      });
      expect(prismaMock.expense.create).toHaveBeenCalledWith({
        data: {
          amount: args.amount,
          description: "Test expense",
          date: dateForStorage,
          user: { connect: { id: dummyUser.id } },
          subcategory: { connect: { id: args.subcategoryId } },
        },
      });
      expect(result).toBe(fakeCreated);
    });

    it("throws error when amount is invalid", async () => {
      const args = {
        amount: -123, // Invalid negative amount
        date: "2022-07-01",
        subcategoryId: "sub-456",
      };

      await expect(
        expenseResolvers.Mutation.createExpense(null, args, context, dummyInfo)
      ).rejects.toThrow("Amount validation failed");
    });

    it("throws error when subcategory doesn't belong to user", async () => {
      prismaMock.subcategory.findFirst.mockResolvedValue(null);

      const args = {
        amount: 123,
        date: "2022-07-01",
        subcategoryId: "sub-456",
      };

      await expect(
        expenseResolvers.Mutation.createExpense(null, args, context, dummyInfo)
      ).rejects.toThrow("Subcategory not found or doesn't belong to user");
    });
  });

  describe("Mutation.updateExpense", () => {
    it("calls prisma.expense.update with correct where/data and returns the updated record", async () => {
      const fakeUpdated = {
        id: "exp2",
        amount: 200,
        date: "2022-08-15T00:00:00.000Z",
        subcategoryId: "sub-789",
        userId: dummyUser.id,
      };
      const existingExpense = { userId: dummyUser.id };
      const fakeSubcategory = { id: "sub-789", name: "Test Sub" };

      prismaMock.expense.findUnique.mockResolvedValue(existingExpense);
      prismaMock.subcategory.findFirst.mockResolvedValue(fakeSubcategory);
      prismaMock.expense.update.mockResolvedValue(fakeUpdated);

      const args = {
        id: "exp2",
        amount: 200,
        date: "2022-08-15",
        subcategoryId: "sub-789",
        description: "Updated expense",
      };
      const result = await expenseResolvers.Mutation.updateExpense(
        null,
        args,
        context,
        dummyInfo
      );

      const [y, m, d] = args.date.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.expense.findUnique).toHaveBeenCalledWith({
        where: { id: args.id },
        select: { userId: true },
      });
      expect(prismaMock.expense.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          amount: args.amount,
          description: "Updated expense",
          date: dateForStorage,
          subcategory: { connect: { id: args.subcategoryId } },
        },
      });
      expect(result).toBe(fakeUpdated);
    });

    it("throws error when expense doesn't belong to user", async () => {
      prismaMock.expense.findUnique.mockResolvedValue(null);

      const args = {
        id: "exp2",
        amount: 200,
      };

      await expect(
        expenseResolvers.Mutation.updateExpense(null, args, context, dummyInfo)
      ).rejects.toThrow("Expense not found or doesn't belong to user");
    });
  });

  describe("Mutation.deleteExpense", () => {
    it("calls prisma.expense.deleteMany and returns confirmation", async () => {
      const deleteResult = { count: 1 };
      prismaMock.expense.deleteMany.mockResolvedValue(deleteResult);

      const args = { id: "exp3" };
      const result = await expenseResolvers.Mutation.deleteExpense(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.expense.deleteMany).toHaveBeenCalledWith({
        where: {
          id: args.id,
          userId: dummyUser.id,
        },
      });
      expect(result).toEqual({ id: args.id });
    });

    it("throws error when expense doesn't belong to user", async () => {
      const deleteResult = { count: 0 };
      prismaMock.expense.deleteMany.mockResolvedValue(deleteResult);
      const args = { id: "missing-exp" };

      await expect(
        expenseResolvers.Mutation.deleteExpense(null, args, context, dummyInfo)
      ).rejects.toThrow("No such Expense found");
    });
  });
});
