import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { ensureAuthenticated, notFoundError } from "../utils.js";
import postmark from "postmark";

let client = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

export const userResolvers = {
  Query: {
    users: (parent, args, context) => {
      return context.prisma.user.findMany({});
    },
    user: (parent, args, context) => {
      return context.prisma.user.findFirst({
        where: { id: args.id },
      });
    },
    me: (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      return context.currentUser;
    },
  },
  Mutation: {
    signup: async (parent, args, context) => {
      const password = await bcrypt.hash(args.password, 10);

      const user = await context.prisma.user.create({
        data: { ...args, password },
      });

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

      return {
        token,
        user,
      };
    },
    login: async (parent, args, context) => {
      const user = await context.prisma.user.findUnique({
        where: { email: args.email },
      });
      if (!user) notFoundError("User");

      const valid = await bcrypt.compare(args.password, user.password);
      if (!valid) {
        throw new Error("Invalid password");
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

      return {
        token,
        user,
      };
    },
    resetPasswordRequest: async (parent, args, context) => {
      const user = await context.prisma.user.findUnique({
        where: { email: args.email },
      });

      if (!user) notFoundError("User");

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      // Send email to user with url and token
      client.sendEmailWithTemplate({
        From: "support@yourmonthly.app",
        To: user.email,
        TemplateAlias: "password-reset",
        TemplateModel: {
          product_name: "Monthly App",
          action_url: `https://yourmonthly.app/reset-password?resetToken=${token}`,
          support_url: "support@yourmonthly.app",
        },
        MessageStream: "outbound",
      });
      console.log(
        `Email sent to user ${user.email} with url and token ${token}`
      );

      return { email: user.email };
    },
    resetPassword: async (parent, args, context) => {
      // Verify token and check if the user exist
      const { userId } = jwt.verify(args.token, process.env.JWT_SECRET);

      const userExists = !!(await context.prisma.user.findFirst({
        where: {
          id: userId,
        },
      }));

      if (!userExists) notFoundError("User");

      // If no error, set new password.
      const newPassword = await bcrypt.hash(args.password, 10);

      const updatedUser = await context.prisma.user.update({
        where: { id: userId },
        data: { password: newPassword },
      });

      return updatedUser;
    },
    updateUser: async (parent, args, context) => {
      ensureAuthenticated(context.currentUser);

      return await context.prisma.user.update({
        where: {
          id: args.id,
        },
        data: {
          currency: args.currency,
        },
      });
    },
    deleteAccount: async (parent, args, context) => {
      // 1. Make sure the user is logged in
      ensureAuthenticated(context.currentUser);

      const userId = context.currentUser.id;

      // 2. Fetch all of this user's categories so we can delete subcategories by categoryId
      const categories = await context.prisma.category.findMany({
        where: { userId },
        select: { id: true },
      });
      const categoryIds = categories.map((c) => c.id);

      // 3. In one atomic transaction, delete in the right order
      await context.prisma.$transaction([
        // a) remove all expenses for this user
        context.prisma.expense.deleteMany({ where: { userId } }),

        // b) remove all saving goals for this user
        context.prisma.savingGoal.deleteMany({ where: { userId } }),

        // c) remove all subcategories whose categoryId is in categoryIds
        //    (if categoryIds is empty, Prisma simply does nothing)
        context.prisma.subcategory.deleteMany({
          where: { categoryId: { in: categoryIds } },
        }),

        // d) now remove all categories for this user
        context.prisma.category.deleteMany({ where: { userId } }),

        // e) finally, delete the user record itself
        context.prisma.user.delete({ where: { id: userId } }),
      ]);

      // 4. Let the client know it worked
      return true;
    },
  },
  User: {
    id: (parent, args, context, info) => parent.id,
    email: (parent) => parent.email,
  },
};
