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
    subcategoryBudget: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    category: {
      findUnique: jest.Mock;
    };
    expense: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
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
      subcategoryBudget: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
      // The resolvers run their writes in one transaction; handing the callback
      // the same mock client keeps the assertions on the plain mocks.
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
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
          // The opening period, so the subcategory has a budget in every month
          // from the start rather than an empty schedule.
          budgets: {
            create: {
              amount: args.budgetAmount,
              validFrom: new Date(Date.UTC(y, m - 1, 1)),
            },
          },
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
      // Read twice: once to decide how to edit the schedule, once by the resync
      // afterwards, which sees the corrected period.
      prismaMock.subcategoryBudget.findMany
        .mockResolvedValueOnce([
          {
            id: "period-1",
            amount: 100,
            validFrom: new Date(Date.UTC(2022, 7, 1)),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "period-1",
            amount: 750,
            validFrom: new Date(Date.UTC(2022, 8, 1)),
          },
        ]);

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

      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          categoryId: args.categoryId,
          name: args.name,
        },
      });
      // budgetAmount and rolloverDate are re-derived from the schedule in a
      // second write, so they are no longer part of the payload above.
      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          budgetAmount: args.budgetAmount,
          rolloverDate: new Date(Date.UTC(2022, 8, 1)),
        },
      });
      expect(result).toBe(fakeUpdated);
    });

    it("corrects the only period in place, moving it with the rollover date", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-xyz",
        category: ownedCategory,
      });
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2022, 7, 1)) },
      ]);

      await subcategoryResolvers.Mutation.updateSubcategory(
        null,
        {
          id: "sub-xyz",
          name: "UpdatedSub",
          budgetAmount: 750,
          rolloverDate: "2022-09-01",
          categoryId: "cat-456",
        },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategoryBudget.update).toHaveBeenCalledWith({
        where: { id: "period-1" },
        data: { amount: 750, validFrom: new Date(Date.UTC(2022, 8, 1)) },
      });
    });

    it("leaves the schedule alone when no amount is passed", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-xyz",
        category: ownedCategory,
        rolloverDate: new Date(Date.UTC(2023, 5, 1)),
      });
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
        { id: "period-2", amount: 700, validFrom: new Date(Date.UTC(2026, 0, 1)) },
      ]);

      // What the edit form now sends: a rename, nothing about money.
      await subcategoryResolvers.Mutation.updateSubcategory(
        null,
        { id: "sub-xyz", name: "Food shopping", categoryId: "cat-456" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategoryBudget.update).not.toHaveBeenCalled();
      expect(prismaMock.subcategoryBudget.create).not.toHaveBeenCalled();
      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: "sub-xyz" },
        data: { categoryId: "cat-456", name: "Food shopping" },
      });
    });

    it("only touches the current amount once the schedule has several periods", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub-xyz",
        category: ownedCategory,
      });
      prismaMock.category.findUnique.mockResolvedValue(ownedCategory);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
        { id: "period-2", amount: 700, validFrom: new Date(Date.UTC(2026, 0, 1)) },
      ]);

      await subcategoryResolvers.Mutation.updateSubcategory(
        null,
        {
          id: "sub-xyz",
          name: "Groceries",
          budgetAmount: 800,
          rolloverDate: "2023-06-01",
          categoryId: "cat-456",
        },
        context,
        dummyInfo,
      );

      // The newest period takes the correction; the 100 era is left alone, which
      // is the whole point of keeping history per period.
      expect(prismaMock.subcategoryBudget.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.subcategoryBudget.update).toHaveBeenCalledWith({
        where: { id: "period-2" },
        data: { amount: 800 },
      });
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

    it("stops a plain member from editing a subcategory they don't manage", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub",
        category: { userId: "creator", groupId: "g1" },
      });

      await expect(
        subcategoryResolvers.Mutation.updateSubcategory(
          null,
          {
            id: "sub",
            name: "X",
            budgetAmount: 1,
            rolloverDate: "2022-09-01",
            categoryId: "cat",
          },
          ctx,
          dummyInfo
        )
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategory.update).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.setSubcategoryBudget", () => {
    const accessibleSub = { id: "sub-xyz", category: ownedCategory };

    it("opens a period without disturbing the earlier one", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
        { id: "period-2", amount: 700, validFrom: new Date(Date.UTC(2026, 0, 1)) },
      ]);

      await subcategoryResolvers.Mutation.setSubcategoryBudget(
        null,
        { subcategoryId: "sub-xyz", amount: 700, validFrom: "2026-01-01" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategoryBudget.upsert).toHaveBeenCalledWith({
        where: {
          subcategoryId_validFrom: {
            subcategoryId: "sub-xyz",
            validFrom: new Date(Date.UTC(2026, 0, 1)),
          },
        },
        create: {
          subcategoryId: "sub-xyz",
          amount: 700,
          validFrom: new Date(Date.UTC(2026, 0, 1)),
        },
        update: { amount: 700 },
      });
    });

    it("normalises a mid-month start to the first of that month", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });

      await subcategoryResolvers.Mutation.setSubcategoryBudget(
        null,
        { subcategoryId: "sub-xyz", amount: 700, validFrom: "2026-01-17" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategoryBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            validFrom: new Date(Date.UTC(2026, 0, 1)),
          }),
        }),
      );
    });

    it("resyncs budgetAmount to the period in force today, not the newest", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      // A raise scheduled for the future must not change what this month reports.
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
        { id: "period-2", amount: 900, validFrom: new Date(Date.UTC(2099, 0, 1)) },
      ]);

      await subcategoryResolvers.Mutation.setSubcategoryBudget(
        null,
        { subcategoryId: "sub-xyz", amount: 900, validFrom: "2099-01-01" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: "sub-xyz" },
        data: {
          budgetAmount: 100,
          rolloverDate: new Date(Date.UTC(2023, 5, 1)),
        },
      });
    });

    it("pulls rolloverDate back when a period is booked before the schedule opened", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([
        { id: "period-0", amount: 80, validFrom: new Date(Date.UTC(2022, 0, 1)) },
        { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
      ]);

      await subcategoryResolvers.Mutation.setSubcategoryBudget(
        null,
        { subcategoryId: "sub-xyz", amount: 80, validFrom: "2022-01-01" },
        context,
        dummyInfo,
      );

      // Otherwise the accrual would start earlier than the expense filter and
      // the remaining budget would read high.
      expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
        where: { id: "sub-xyz" },
        data: {
          budgetAmount: 100,
          rolloverDate: new Date(Date.UTC(2022, 0, 1)),
        },
      });
    });

    it("rejects a negative amount", async () => {
      await expect(
        subcategoryResolvers.Mutation.setSubcategoryBudget(
          null,
          { subcategoryId: "sub-xyz", amount: -5, validFrom: "2026-01-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError(/Amount validation failed/);
      expect(prismaMock.subcategoryBudget.upsert).not.toHaveBeenCalled();
    });

    it("rejects a subcategory the caller cannot manage", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Mutation.setSubcategoryBudget(
          null,
          { subcategoryId: "not-mine", amount: 700, validFrom: "2026-01-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategoryBudget.upsert).not.toHaveBeenCalled();
    });

    it("stops a plain member from rescheduling someone else's budget", async () => {
      const ctx = { ...context, groups: [{ groupId: "g1", role: "MEMBER" }] };
      prismaMock.subcategory.findUnique.mockResolvedValue({
        id: "sub",
        category: { userId: "creator", groupId: "g1" },
      });

      await expect(
        subcategoryResolvers.Mutation.setSubcategoryBudget(
          null,
          { subcategoryId: "sub", amount: 700, validFrom: "2026-01-01" },
          ctx,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategoryBudget.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.deleteSubcategoryBudget", () => {
    const accessibleSub = { id: "sub-xyz", category: ownedCategory };
    const twoPeriods = [
      { id: "period-1", amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
      { id: "period-2", amount: 700, validFrom: new Date(Date.UTC(2026, 0, 1)) },
    ];

    it("removes the period starting in that month", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategory.update.mockResolvedValue({ id: "sub-xyz" });
      prismaMock.subcategoryBudget.findMany.mockResolvedValue(twoPeriods);

      await subcategoryResolvers.Mutation.deleteSubcategoryBudget(
        null,
        { subcategoryId: "sub-xyz", validFrom: "2026-01-01" },
        context,
        dummyInfo,
      );

      expect(prismaMock.subcategoryBudget.delete).toHaveBeenCalledWith({
        where: { id: "period-2" },
      });
    });

    it("refuses to remove the only period", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategoryBudget.findMany.mockResolvedValue([twoPeriods[0]]);

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategoryBudget(
          null,
          { subcategoryId: "sub-xyz", validFrom: "2023-06-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("A subcategory needs at least one budget period");
      expect(prismaMock.subcategoryBudget.delete).not.toHaveBeenCalled();
    });

    it("throws when no period starts in that month", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(accessibleSub);
      prismaMock.subcategoryBudget.findMany.mockResolvedValue(twoPeriods);

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategoryBudget(
          null,
          { subcategoryId: "sub-xyz", validFrom: "2024-03-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("No budget period starts in that month");
      expect(prismaMock.subcategoryBudget.delete).not.toHaveBeenCalled();
    });

    it("rejects a subcategory the caller cannot manage", async () => {
      prismaMock.subcategory.findUnique.mockResolvedValue(null);

      await expect(
        subcategoryResolvers.Mutation.deleteSubcategoryBudget(
          null,
          { subcategoryId: "not-mine", validFrom: "2026-01-01" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrowError("Subcategory not found or doesn't belong to user");
      expect(prismaMock.subcategoryBudget.delete).not.toHaveBeenCalled();
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
