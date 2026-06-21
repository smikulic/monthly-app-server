// src/resolvers/__tests__/expenseResolvers.test.ts

import { expenseResolvers } from "../expenseResolvers";
import { getFilterDateRange } from "../../utils/getFilterDateRange";

describe("expenseResolvers", () => {
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;

  // A category the dummy user owns personally.
  const ownedCategory = { userId: dummyUser.id, groupId: null };

  // Default ALL scope for a user with no groups.
  const allScopeCategoryWhere = {
    OR: [{ userId: dummyUser.id, groupId: null }, { groupId: { in: [] } }],
  };

  let prismaMock: {
    expense: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
    };
    subcategory: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
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
        findUnique: jest.fn(),
      },
      subcategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
      groups: [],
    };
  });

  describe("Query.expenses", () => {
    it("scopes by category access (no date filter)", async () => {
      const fakeExpenses = [{ id: "e1" }, { id: "e2" }];
      prismaMock.expense.findMany.mockReturnValue(fakeExpenses);

      const result = await expenseResolvers.Query.expenses(
        null,
        {} as any,
        context,
        dummyInfo,
      );

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: { subcategory: { category: allScopeCategoryWhere } },
        include: { user: true },
        orderBy: { date: "asc" },
      });
      expect(result).toBe(fakeExpenses);
    });

    it("adds the date filter when provided", async () => {
      const filterDate = "2022-06-15";
      const { gte, lt } = getFilterDateRange(filterDate);
      prismaMock.expense.findMany.mockReturnValue([]);

      await expenseResolvers.Query.expenses(
        null,
        { filter: { date: filterDate } } as any,
        context,
        dummyInfo,
      );

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          subcategory: { category: allScopeCategoryWhere },
          date: { gte, lt },
        },
        include: { user: true },
        orderBy: { date: "asc" },
      });
    });
  });

  describe("Query.chartExpenses", () => {
    it("computes totals and scopes both queries by category access", async () => {
      const filterDate = "2022-03-10";
      const expenseRecords = [
        { amount: 100, date: new Date("2022-01-05"), subcategoryId: "sub1" },
        { amount: 50, date: new Date("2022-01-20"), subcategoryId: "sub1" },
        { amount: 200, date: new Date("2022-02-15"), subcategoryId: "sub2" },
        { amount: 300, date: new Date("2022-03-01"), subcategoryId: "sub1" },
      ];
      const groupByResult = [
        { subcategoryId: "sub1", _sum: { amount: 450 } },
        { subcategoryId: "sub2", _sum: { amount: 200 } },
      ];
      const subcats = [
        { id: "sub1", name: "Sub One", category: { name: "Cat A" } },
        { id: "sub2", name: "Sub Two", category: { name: "Cat B" } },
      ];

      prismaMock.expense.findMany.mockResolvedValue(expenseRecords);
      prismaMock.expense.groupBy.mockResolvedValue(groupByResult);
      prismaMock.subcategory.findMany.mockResolvedValue(subcats);

      const result = await expenseResolvers.Query.chartExpenses(
        null,
        { filter: { date: filterDate } } as any,
        context,
        dummyInfo,
      );

      expect(result.monthlyTotals).toEqual([
        150, 200, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(result.categoryExpenseTotals).toEqual([
        { categoryName: "Cat A", subcategoryName: "Sub One", total: 450 },
        { categoryName: "Cat B", subcategoryName: "Sub Two", total: 200 },
      ]);

      const year = new Date(filterDate).getFullYear();
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          subcategory: { category: allScopeCategoryWhere },
          date: { gte: startDate, lte: endDate },
        },
        select: { amount: true, date: true, subcategoryId: true },
      });
      expect(prismaMock.expense.groupBy).toHaveBeenCalledWith({
        by: ["subcategoryId"],
        where: {
          subcategory: { category: allScopeCategoryWhere },
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      });
    });
  });

  describe("Mutation.createExpense", () => {
    it("creates an expense in a subcategory the caller can access", async () => {
      const fakeCreated = { id: "exp1" };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        category: ownedCategory,
      });
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
        dummyInfo,
      );

      const [y, m, d] = args.date.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.subcategory.findUnique).toHaveBeenCalledWith({
        where: { id: args.subcategoryId },
        select: { category: { select: { userId: true, groupId: true } } },
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

    it("throws when amount is invalid", async () => {
      await expect(
        expenseResolvers.Mutation.createExpense(
          null,
          { amount: -123, date: "2022-07-01", subcategoryId: "sub-456" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Amount validation failed");
    });

    it("throws when the subcategory is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        expenseResolvers.Mutation.createExpense(
          null,
          { amount: 123, date: "2022-07-01", subcategoryId: "sub-456" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Subcategory not found or doesn't belong to user");
    });
  });

  describe("Mutation.updateExpense", () => {
    it("updates an expense whose category the caller can access", async () => {
      const fakeUpdated = { id: "exp2" };
      prismaMock.expense.findUnique.mockResolvedValue({
        subcategory: { category: ownedCategory },
      });
      prismaMock.subcategory.findUnique.mockResolvedValue({
        category: ownedCategory,
      });
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
        dummyInfo,
      );

      const [y, m, d] = args.date.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.expense.findUnique).toHaveBeenCalledWith({
        where: { id: args.id },
        select: {
          subcategory: {
            select: { category: { select: { userId: true, groupId: true } } },
          },
        },
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

    it("throws when the expense is not accessible", async () => {
      prismaMock.expense.findUnique.mockResolvedValue(null);

      await expect(
        expenseResolvers.Mutation.updateExpense(
          null,
          { id: "exp2", amount: 200 },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Expense not found or doesn't belong to user");
    });
  });

  describe("Mutation.deleteExpense", () => {
    it("deletes an expense the caller can access", async () => {
      prismaMock.expense.findUnique.mockResolvedValue({
        subcategory: { category: ownedCategory },
      });
      prismaMock.expense.delete.mockResolvedValue({ id: "exp3" });

      const result = await expenseResolvers.Mutation.deleteExpense(
        null,
        { id: "exp3" },
        context,
        dummyInfo,
      );

      expect(prismaMock.expense.delete).toHaveBeenCalledWith({
        where: { id: "exp3" },
      });
      expect(result).toEqual({ id: "exp3" });
    });

    it("throws when the expense is not accessible", async () => {
      prismaMock.expense.findUnique.mockResolvedValue(null);

      await expect(
        expenseResolvers.Mutation.deleteExpense(
          null,
          { id: "missing-exp" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("No such Expense found");
      expect(prismaMock.expense.delete).not.toHaveBeenCalled();
    });
  });
});
