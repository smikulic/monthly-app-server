// src/resolvers/__tests__/subcategoryResolvers.test.ts
//
// Access control and the writes each mutation performs. The budgeting maths is
// pure and lives in utils/__tests__/budgetPeriods.test.ts, so it is not
// re-tested through a pile of mocks here.

import { subcategoryResolvers } from "../subcategoryResolvers";
import { getFilterDateRange } from "../../utils/getFilterDateRange";

describe("subcategoryResolvers", () => {
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;
  const ownedCategory = { userId: dummyUser.id, groupId: null };
  const accessibleSub = { id: "sub-1", category: ownedCategory };

  const period = (amount: number, year: number, month: number) => ({
    id: `p-${year}-${month}`,
    amount,
    validFrom: new Date(Date.UTC(year, month, 1)),
  });

  let prismaMock: any;
  let context: any;

  beforeEach(() => {
    prismaMock = {
      subcategory: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      subcategoryBudget: {
        findMany: jest.fn().mockResolvedValue([period(100, 2023, 5)]),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      category: { findUnique: jest.fn() },
      expense: { findMany: jest.fn() },
      // Handing the callback the same mock keeps assertions on the plain mocks.
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };

    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
      groups: [],
      loaders: {
        subcategoryBudget: { load: jest.fn() },
        subcategorySpend: { load: jest.fn() },
      },
    };
  });

  describe("Query.subcategory", () => {
    it("returns a subcategory whose parent category the caller can access", async () => {
      const fakeSub = { id: "sub-abc", category: ownedCategory };
      prismaMock.subcategory.findUnique.mockResolvedValue(fakeSub);

      const result = await subcategoryResolvers.Query.subcategory(
        null,
        { id: "sub-abc" },
        context,
        dummyInfo,
      );

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
    const args = {
      name: "NewSub",
      budgetAmount: 500,
      validFrom: "2022-08-01",
      icon: null,
      categoryId: "cat-123",
    };

    it("creates the row and its opening period together", async () => {
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.create.mockResolvedValue({ id: "new-sub" });

      await subcategoryResolvers.Mutation.createSubcategory(
        null,
        args,
        context,
        dummyInfo,
      );

      const validFrom = new Date(Date.UTC(2022, 7, 1));
      expect(prismaMock.subcategory.create).toHaveBeenCalledWith({
        data: {
          name: args.name,
          budgetAmount: 500,
          rolloverDate: validFrom,
          icon: "",
          category: { connect: { id: args.categoryId } },
          budgets: { create: { amount: 500, validFrom } },
        },
      });
    });

    it("rejects creating under a category the caller cannot access", async () => {
      prismaMock.category.findUnique.mockResolvedValue({
        userId: "another-user",
        groupId: null,
      });

      await expect(
        subcategoryResolvers.Mutation.createSubcategory(
          null,
          args,
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Category not found or doesn't belong to user");
      expect(prismaMock.subcategory.create).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.updateSubcategory", () => {
    const args = { id: "sub-1", name: "Renamed", categoryId: "cat-456" };

    it("renames without touching the schedule", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-1" });

      await subcategoryResolvers.Mutation.updateSubcategory(
        null,
        args,
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: "sub-1" },
        data: { categoryId: "cat-456", name: "Renamed" },
      });
      expect(prismaMock.subcategoryBudget.upsert).not.toHaveBeenCalled();
    });

    it("throws when the subcategory is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Mutation.updateSubcategory(
          null,
          args,
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategory.update).not.toHaveBeenCalled();
    });

    it("throws when the target category is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.category.findUnique.mockResolvedValue({
        userId: "another-user",
        groupId: null,
      });

      await expect(
        subcategoryResolvers.Mutation.updateSubcategory(
          null,
          args,
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Category not found or doesn't belong to user");
      expect(prismaMock.subcategory.update).not.toHaveBeenCalled();
    });

    it("stops a plain member from editing a subcategory they don't manage", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-1",
        category: { userId: "creator", groupId: "g1" },
      });

      await expect(
        subcategoryResolvers.Mutation.updateSubcategory(
          null,
          args,
          ctx,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
    });
  });

  describe("Mutation.setSubcategoryBudget", () => {
    it("upserts the period and re-derives both cached columns", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-1" });
      // A raise booked for the future must not change what this month reports,
      // and the schedule's opening month is what rolloverDate mirrors.
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        period(100, 2023, 5),
        period(900, 2099, 0),
      ]);

      await subcategoryResolvers.Mutation.setSubcategoryBudget(
        null,
        { subcategoryId: "sub-1", amount: 900, validFrom: "2099-01-17" },
        context,
        dummyInfo,
      );

      // Mid-month starts collapse to the 1st.
      expect(prismaMock.subcategoryBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            validFrom: new Date(Date.UTC(2099, 0, 1)),
          }),
          update: { amount: 900 },
        }),
      );
      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: "sub-1" },
        data: {
          budgetAmount: 100,
          rolloverDate: new Date(Date.UTC(2023, 5, 1)),
        },
      });
    });

    it("rejects a negative amount", async () => {
      await expect(
        subcategoryResolvers.Mutation.setSubcategoryBudget(
          null,
          { subcategoryId: "sub-1", amount: -5, validFrom: "2026-01-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError(/amount validation failed/i);
      expect(prismaMock.subcategoryBudget.upsert).not.toHaveBeenCalled();
    });

    it("stops a plain member from rescheduling someone else's budget", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-1",
        category: { userId: "creator", groupId: "g1" },
      });

      await expect(
        subcategoryResolvers.Mutation.setSubcategoryBudget(
          null,
          { subcategoryId: "sub-1", amount: 700, validFrom: "2026-01-01" },
          ctx,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategoryBudget.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.deleteSubcategoryBudget", () => {
    beforeEach(() => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-1" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        period(100, 2023, 5),
        period(700, 2026, 0),
      ]);
    });

    it("removes the period starting in that month", async () => {
      await subcategoryResolvers.Mutation.deleteSubcategoryBudget(
        null,
        { subcategoryId: "sub-1", validFrom: "2026-01-01" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategoryBudget.delete).toHaveBeenCalledWith({
        where: { id: "p-2026-0" },
      });
    });

    it("throws when no period starts in that month", async () => {
      await expect(
        subcategoryResolvers.Mutation.deleteSubcategoryBudget(
          null,
          { subcategoryId: "sub-1", validFrom: "2024-03-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("No budget period starts in that month");
      expect(prismaMock.subcategoryBudget.delete).not.toHaveBeenCalled();
    });

    it("refuses to remove the only period", async () => {
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        period(100, 2023, 5),
      ]);

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategoryBudget(
          null,
          { subcategoryId: "sub-1", validFrom: "2023-06-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("A subcategory needs at least one budget period");
      expect(prismaMock.subcategoryBudget.delete).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.deleteSubcategory", () => {
    it("deletes a subcategory the caller can access", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.delete.mockResolvedValue({ id: "sub-1" });

      await subcategoryResolvers.Mutation.deleteSubcategory(
        null,
        { id: "sub-1" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategory.delete).toHaveBeenCalledWith({
        where: { id: "sub-1" },
      });
    });

    it("throws when the subcategory is not accessible", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategory(
          null,
          { id: "someone-elses" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategory.delete).not.toHaveBeenCalled();
    });
  });

  describe("Subcategory computed fields", () => {
    const periods = [period(100, 2023, 5), period(700, 2026, 0)];

    it("budgetForMonth reports the amount that applied then", async () => {
      context.loaders.subcategoryBudget.load.mockResolvedValue(periods);

      await expect(
        subcategoryResolvers.Subcategory.budgetForMonth(
          { id: "sub-1" },
          { date: "2025-12-01" },
          context,
          dummyInfo,
        ),
      ).resolves.toBe(100);
    });

    it("rolloverRemaining nets spend off the accrual and asks for the right month end", async () => {
      context.loaders.subcategoryBudget.load.mockResolvedValue(periods);
      context.loaders.subcategorySpend.load.mockResolvedValue(1200);

      // Jun 2023 to Dec 2025 is 31 months at 100, Jan to Mar 2026 is 3 at 700.
      await expect(
        subcategoryResolvers.Subcategory.rolloverRemaining(
          { id: "sub-1" },
          { date: "2026-03-01" },
          context,
          dummyInfo,
        ),
      ).resolves.toBe(31 * 100 + 3 * 700 - 1200);

      expect(context.loaders.subcategorySpend.load).toHaveBeenCalledWith(
        `sub-1|${new Date(Date.UTC(2026, 3, 1)).toISOString()}`,
      );
    });
  });

  describe("Subcategory.expenses", () => {
    it("calls prisma.expense.findMany with correct where and orderBy", async () => {
      const fakeExpenses = [{ id: "exp-1" }];
      prismaMock.expense.findMany.mockResolvedValue(fakeExpenses);

      const result = await subcategoryResolvers.Subcategory.expenses(
        { id: "sub-1" },
        { filter: { date: "2023-05-01" } },
        context,
        dummyInfo,
      );

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          subcategoryId: "sub-1",
          date: getFilterDateRange("2023-05-01"),
        },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(fakeExpenses);
    });
  });
});
