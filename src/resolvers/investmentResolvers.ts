// src/resolvers/investmentResolvers.ts

import { secured } from "../utils/secured.js";
import { notFoundError } from "../utils/notFoundError.js";
import { GraphQLResolveInfo } from "graphql";

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
        return await context.prisma.investment.create({
          data: {
            name: args.input.name,
            quantity: args.input.quantity,
            amount: args.input.amount,
            currency: args.input.currency,
            startDate: new Date(args.input.startDate).toISOString(),
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

        // 2) Perform the update
        const updated = await context.prisma.investment.update({
          where: { id: args.input.id },
          data: {
            name: args.input.name ?? undefined,
            quantity: args.input.quantity ?? undefined,
            amount: args.input.amount ?? undefined,
            currency: args.input.currency ?? undefined,
            startDate: args.input.startDate
              ? new Date(args.input.startDate).toISOString()
              : undefined,
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
