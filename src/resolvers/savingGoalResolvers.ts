import { notFoundError } from "../utils/notFoundError.js";
import { secured } from "../utils/secured.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

export const savingGoalResolvers = {
  Query: {
    savingGoals: secured((parent, args, context) => {
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
    }),
  },
  Mutation: {
    createSavingGoal: secured(async (parent, args, context) => {
      // Validate inputs
      if (
        !args.name ||
        typeof args.name !== "string" ||
        args.name.trim().length === 0
      ) {
        throw new Error("Saving goal name is required");
      }

      const goalAmountValidation = validatePositiveInteger(
        args.goalAmount,
        "goalAmount"
      );
      if (!goalAmountValidation.isValid) {
        throw new Error(
          `Goal amount validation failed: ${goalAmountValidation.errors.join(
            ", "
          )}`
        );
      }

      const initialAmountValidation = validatePositiveInteger(
        args.initialSaveAmount,
        "initialSaveAmount"
      );
      if (!initialAmountValidation.isValid) {
        throw new Error(
          `Initial save amount validation failed: ${initialAmountValidation.errors.join(
            ", "
          )}`
        );
      }

      const dateValidation = validateDate(args.goalDate, "goalDate");
      if (!dateValidation.isValid) {
        throw new Error(
          `Goal date validation failed: ${dateValidation.errors.join(", ")}`
        );
      }

      const [y, m, d] = args.goalDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      return await context.prisma.savingGoal.create({
        data: {
          name: sanitizeString(args.name, 100),
          goalDate: dateForStorage,
          goalAmount: args.goalAmount,
          initialSaveAmount: args.initialSaveAmount,
          user: { connect: { id: context.currentUser.id } },
        },
      });
    }),
    updateSavingGoal: secured(async (parent, args, context) => {
      const [y, m, d] = args.goalDate.split("-").map(Number);
      const dateForStorage = new Date(Date.UTC(y, m - 1, d));

      return await context.prisma.savingGoal.update({
        where: {
          id: args.id,
        },
        data: {
          name: args.name,
          goalDate: dateForStorage,
          goalAmount: args.goalAmount,
          initialSaveAmount: args.initialSaveAmount,
        },
      });
    }),
    deleteSavingGoal: secured(async (parent, args, context) => {
      const deleteSavingGoalResponse = await context.prisma.savingGoal.delete({
        where: {
          id: args.id,
        },
      });

      if (!deleteSavingGoalResponse) notFoundError("Saving Goal");

      return deleteSavingGoalResponse;
    }),
  },
};
