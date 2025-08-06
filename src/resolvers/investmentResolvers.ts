// src/resolvers/investmentResolvers.ts

import { secured } from "../utils/secured.js";
import { notFoundError } from "../utils/notFoundError.js";
import {
  sanitizeString,
  validatePositiveInteger,
  validateDate,
} from "../utils/validation.js";

export const investmentResolvers = {
  Query: {
    investments: secured(async (_parent, _args, context, _info) => {
      return await context.prisma.investment.findMany({
        where: { userId: context.currentUser.id },
        orderBy: { createdAt: "asc" },
      });
    }),

    investment: secured(
      async (_parent, args: { id: string }, context, _info) => {
        const investmentResponse = await context.prisma.investment.findUnique({
          where: { id: args.id },
        });
        if (
          !investmentResponse ||
          investmentResponse.userId !== context.currentUser.id
        ) {
          throw notFoundError("Investment");
        }
        return investmentResponse;
      }
    ),
  },

  Mutation: {
    createInvestment: secured(
      async (_parent, args: { input: any }, context, _info) => {
        // Validate inputs
        const amountValidation = validatePositiveInteger(
          args.input.amount,
          "amount"
        );
        if (!amountValidation.isValid) {
          throw new Error(
            `Amount validation failed: ${amountValidation.errors.join(", ")}`
          );
        }

        const initialAmountValidation = validatePositiveInteger(
          args.input.initialAmount,
          "initialAmount"
        );
        if (!initialAmountValidation.isValid) {
          throw new Error(
            `Initial amount validation failed: ${initialAmountValidation.errors.join(
              ", "
            )}`
          );
        }

        const dateValidation = validateDate(args.input.startDate, "startDate");
        if (!dateValidation.isValid) {
          throw new Error(
            `Start date validation failed: ${dateValidation.errors.join(", ")}`
          );
        }

        const [y, m, d] = args.input.startDate.split("-").map(Number);
        const dateForStorage = new Date(Date.UTC(y, m - 1, d));

        return await context.prisma.investment.create({
          data: {
            name: sanitizeString(args.input.name, 100),
            quantity: args.input.quantity,
            amount: args.input.amount,
            currency: sanitizeString(args.input.currency, 10).toUpperCase(),
            startDate: dateForStorage,
            initialAmount: args.input.initialAmount,
            user: { connect: { id: context.currentUser.id } },
          },
        });
      }
    ),

    updateInvestment: secured(
      async (_parent, args: { input: any }, context, _info) => {
        // 1) Verify it belongs to the current user
        const existingInvestment = await context.prisma.investment.findUnique({
          where: { id: args.input.id },
          select: { userId: true },
        });
        if (
          !existingInvestment ||
          existingInvestment.userId !== context.currentUser.id
        ) {
          throw notFoundError("Investment");
        }

        let dateForStorage = undefined;
        if (args.input.startDate) {
          const [y, m, d] = args.input.startDate.split("-").map(Number);
          dateForStorage = new Date(Date.UTC(y, m - 1, d));
        }

        // 2) Perform the update
        const updated = await context.prisma.investment.update({
          where: { id: args.input.id },
          data: {
            name: args.input.name ?? undefined,
            quantity: args.input.quantity ?? undefined,
            amount: args.input.amount ?? undefined,
            currency: args.input.currency ?? undefined,
            startDate: dateForStorage,
            initialAmount: args.input.initialAmount ?? undefined,
          },
        });
        return updated;
      }
    ),

    deleteInvestment: secured(
      async (_parent, args: { id: string }, context, _info) => {
        const deletedCount = await context.prisma.investment.deleteMany({
          where: {
            id: args.id,
            userId: context.currentUser.id,
          },
        });
        if (deletedCount.count === 0) {
          throw notFoundError("Investment");
        }
        return true;
      }
    ),
  },
};
