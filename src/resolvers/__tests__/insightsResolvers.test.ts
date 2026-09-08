// src/resolvers/__tests__/insightsResolvers.test.ts
//
// Covers the shared spend split. The rest of the insights payload is arithmetic
// over the same mocks and is not re-asserted here.

import { insightsResolvers } from "../insightsResolvers";

describe("insightsResolvers shared spend", () => {
  const dummyUser = {
    id: "ana",
    email: "ana@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;
  const date = "2026-03-10";

  const period = (amount: number) => [
    { amount, validFrom: new Date(Date.UTC(2023, 0, 1)) },
  ];

  let prismaMock: any;
  let context: any;

  beforeEach(() => {
    prismaMock = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      groupMember: { findMany: jest.fn().mockResolvedValue([]) },
    };

    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
      groups: [{ groupId: "household", role: "OWNER" }],
    };
  });

  /** cur, prev and streak expense reads, in the order the resolver makes them. */
  const mockExpenseReads = (current: any[]) =>
    prismaMock.expense.findMany
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

  const run = () =>
    insightsResolvers.Query.insights(null, { date }, context, dummyInfo);

  it("splits a shared subcategory by who paid, and shows a member who spent nothing", async () => {
    prismaMock.category.findMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Household",
        groupId: "household",
        subcategories: [
          { id: "sub-1", name: "Groceries", budgets: period(700) },
        ],
      },
    ]);
    prismaMock.groupMember.findMany.mockResolvedValue([
      { userId: "ana", user: { name: "Ana", email: "ana@example.com" } },
      { userId: "ivan", user: { name: "Ivan", email: "ivan@example.com" } },
    ]);
    mockExpenseReads([
      {
        id: "e1",
        amount: 300,
        date: new Date(2026, 2, 4),
        subcategoryId: "sub-1",
        userId: "ana",
        user: { name: "Ana", email: "ana@example.com" },
      },
      {
        id: "e2",
        amount: 120,
        date: new Date(2026, 2, 9),
        subcategoryId: "sub-1",
        userId: "ana",
        user: { name: "Ana", email: "ana@example.com" },
      },
    ]);

    const result = await run();

    expect(result.sharedSplits).toEqual([
      {
        subcategoryId: "sub-1",
        subcategoryName: "Groceries",
        categoryName: "Household",
        total: 420,
        perUser: [
          { userId: "ana", name: "Ana", spent: 420 },
          // Present at zero: otherwise the comparison cannot be read.
          { userId: "ivan", name: "Ivan", spent: 0 },
        ],
      },
    ]);
    expect(result.sharedTotalsByUser).toEqual([
      { userId: "ana", name: "Ana", spent: 420 },
      { userId: "ivan", name: "Ivan", spent: 0 },
    ]);
  });

  it("leaves personal categories out of the split", async () => {
    prismaMock.category.findMany.mockResolvedValue([
      {
        id: "cat-2",
        name: "Personal",
        groupId: null,
        subcategories: [{ id: "sub-2", name: "Books", budgets: period(50) }],
      },
    ]);
    mockExpenseReads([
      {
        id: "e3",
        amount: 40,
        date: new Date(2026, 2, 5),
        subcategoryId: "sub-2",
        userId: "ana",
        user: { name: "Ana", email: "ana@example.com" },
      },
    ]);

    const result = await run();

    // Nothing shared, so nobody to compare against.
    expect(result.sharedSplits).toEqual([]);
    expect(result.sharedTotalsByUser).toEqual([]);
    expect(prismaMock.groupMember.findMany).not.toHaveBeenCalled();
    // The spend still counts towards the ordinary totals.
    expect(result.totalSpent).toBe(40);
  });

  it("still attributes an expense from someone who left the group", async () => {
    prismaMock.category.findMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Household",
        groupId: "household",
        subcategories: [
          { id: "sub-1", name: "Groceries", budgets: period(700) },
        ],
      },
    ]);
    prismaMock.groupMember.findMany.mockResolvedValue([
      { userId: "ana", user: { name: "Ana", email: "ana@example.com" } },
    ]);
    mockExpenseReads([
      {
        id: "e4",
        amount: 90,
        date: new Date(2026, 2, 6),
        subcategoryId: "sub-1",
        userId: "gone",
        user: { name: "Petra", email: "petra@example.com" },
      },
    ]);

    const result = await run();

    expect(result.sharedTotalsByUser).toEqual([
      { userId: "gone", name: "Petra", spent: 90 },
      { userId: "ana", name: "Ana", spent: 0 },
    ]);
  });
});
