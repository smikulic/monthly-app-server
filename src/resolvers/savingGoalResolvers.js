import { ensureAuthenticated, notFoundError } from "../utils";

export const savingGoalResolvers = {
  Query: {
    savingGoals: (parent, args, context) => {
      const savingGoalsResponse = context.prisma.savingGoal.findMany({
        where: { userId: context.currentUser.id },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc", // or 'desc' for descending order
        },
      });
      return savingGoalsResponse;
    },
  },
  Mutation: {
    createSavingGoal: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      return await context.prisma.savingGoal.create({
        data: {
          name: args.name,
          goalDate: new Date(args.goalDate).toISOString(),
          goalAmount: args.goalAmount,
          initialSaveAmount: args.initialSaveAmount,
          user: { connect: { id: context.currentUser.id } },
        },
      });
    },
    updateSavingGoal: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      return await context.prisma.savingGoal.update({
        where: {
          id: args.id,
        },
        data: {
          name: args.name,
          goalDate: new Date(args.goalDate).toISOString(),
          goalAmount: args.goalAmount,
          initialSaveAmount: args.initialSaveAmount,
        },
      });
    },
    deleteSavingGoal: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      const deleteSavingGoalResponse = await context.prisma.savingGoal.delete({
        where: {
          id: args.id,
        },
      });

      if (!deleteSavingGoalResponse) notFoundError("Saving Goal");

      return deleteSavingGoalResponse;
    },
  },
};
