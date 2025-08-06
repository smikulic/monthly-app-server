// src/resolvers/__tests__/savingGoalResolvers.test.ts

import { savingGoalResolvers } from "../savingGoalResolvers";

describe("savingGoalResolvers", () => {
  // currentUser must include "email" and "emailConfirmed" to satisfy secured()
  const dummyUser = {
    id: "user-123",
    email: "user@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;

  let prismaMock: {
    savingGoal: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let context: any;

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock = {
      savingGoal: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
    };
  });

  describe("Query.savingGoals", () => {
    it("calls prisma.savingGoal.findMany with correct where/include/orderBy and returns result", async () => {
      const fakeGoals = [
        { id: "g1", name: "Goal One" },
        { id: "g2", name: "Goal Two" },
      ];
      prismaMock.savingGoal.findMany.mockResolvedValue(fakeGoals);

      // secured → 4 args
      const result = await savingGoalResolvers.Query.savingGoals(
        null,
        {},
        context,
        dummyInfo
      );

      expect(prismaMock.savingGoal.findMany).toHaveBeenCalledWith({
        where: { userId: dummyUser.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(fakeGoals);
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      await expect(
        savingGoalResolvers.Query.savingGoals(null, {}, badContext, dummyInfo)
      ).rejects.toThrowError("Unauthenticated!");
    });
  });

  describe("Mutation.createSavingGoal", () => {
    it("calls prisma.savingGoal.create with correct data and returns created record", async () => {
      const fakeCreated = {
        id: "new-goal",
        name: "New Goal",
        goalDate: "2023-12-31T00:00:00.000Z",
        goalAmount: 1000,
        initialSaveAmount: 100,
      };
      prismaMock.savingGoal.create.mockResolvedValue(fakeCreated);

      const args = {
        name: "New Goal",
        goalDate: "2023-12-31",
        goalAmount: 1000,
        initialSaveAmount: 100,
      };
      // secured → 4 args
      const result = await savingGoalResolvers.Mutation.createSavingGoal(
        null,
        args,
        context,
        dummyInfo
      );

      const [y, m, d] = args.goalDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.savingGoal.create).toHaveBeenCalledWith({
        data: {
          name: args.name,
          goalDate: dateForStorage,
          goalAmount: args.goalAmount,
          initialSaveAmount: args.initialSaveAmount,
          user: { connect: { id: dummyUser.id } },
        },
      });
      expect(result).toBe(fakeCreated);
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      const args = {
        name: "X",
        goalDate: "2023-01-01",
        goalAmount: 500,
        initialSaveAmount: 50,
      };
      await expect(
        savingGoalResolvers.Mutation.createSavingGoal(
          null,
          args,
          badContext,
          dummyInfo
        )
      ).rejects.toThrowError("Unauthenticated!");
    });
  });

  describe("Mutation.updateSavingGoal", () => {
    it("calls prisma.savingGoal.update with correct where/data and returns updated record", async () => {
      const fakeUpdated = {
        id: "g1",
        name: "Updated Goal",
        goalDate: "2024-06-30T00:00:00.000Z",
        goalAmount: 2000,
        initialSaveAmount: 200,
      };
      prismaMock.savingGoal.update.mockResolvedValue(fakeUpdated);

      const args = {
        id: "g1",
        name: "Updated Goal",
        goalDate: "2024-06-30",
        goalAmount: 2000,
        initialSaveAmount: 200,
      };
      const result = await savingGoalResolvers.Mutation.updateSavingGoal(
        null,
        args,
        context,
        dummyInfo
      );

      const [y, m, d] = args.goalDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      expect(prismaMock.savingGoal.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: {
          name: args.name,
          goalDate: dateForStorage,
          goalAmount: args.goalAmount,
          initialSaveAmount: args.initialSaveAmount,
        },
      });
      expect(result).toBe(fakeUpdated);
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      const args = {
        id: "g1",
        name: "X",
        goalDate: "2023-01-01",
        goalAmount: 500,
        initialSaveAmount: 50,
      };
      await expect(
        savingGoalResolvers.Mutation.updateSavingGoal(
          null,
          args,
          badContext,
          dummyInfo
        )
      ).rejects.toThrowError("Unauthenticated!");
    });
  });

  describe("Mutation.deleteSavingGoal", () => {
    it("calls prisma.savingGoal.delete and returns deleted record", async () => {
      const fakeDeleted = { id: "g1", name: "ToDelete" };
      prismaMock.savingGoal.delete.mockResolvedValue(fakeDeleted);

      const args = { id: "g1" };
      const result = await savingGoalResolvers.Mutation.deleteSavingGoal(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.savingGoal.delete).toHaveBeenCalledWith({
        where: { id: args.id },
      });
      expect(result).toBe(fakeDeleted);
    });

    it("throws notFoundError when prisma.savingGoal.delete resolves to null", async () => {
      prismaMock.savingGoal.delete.mockResolvedValue(null);
      const args = { id: "missing-goal" };

      await expect(
        savingGoalResolvers.Mutation.deleteSavingGoal(
          null,
          args,
          context,
          dummyInfo
        )
      ).rejects.toThrowError(new Error("No such Saving Goal found"));
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      const args = { id: "g1" };
      await expect(
        savingGoalResolvers.Mutation.deleteSavingGoal(
          null,
          args,
          badContext,
          dummyInfo
        )
      ).rejects.toThrowError("Unauthenticated!");
    });
  });
});
