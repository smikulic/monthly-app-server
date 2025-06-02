import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { JWT_SECRET } from "../constants";
import { notFoundError } from "../utils/notFoundError";
import { secured } from "../utils/secured";
import { sendConfirmationEmail, sendPasswordResetEmail, } from "../helpers/emails";
import { generateBudgetReportPdf } from "../helpers/reports";
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
        me: secured((parent, args, context) => {
            return context.currentUser;
        }),
        generateReport: secured(async (_parent, { year }, context) => {
            const { prisma, currentUser } = context;
            const userId = currentUser.id;
            return generateBudgetReportPdf(prisma, userId, year);
        }),
    },
    Mutation: {
        signup: async (_parent, args, context) => {
            const password = await bcrypt.hash(args.password, 10);
            const user = await context.prisma.user.create({
                data: { ...args, password },
            });
            const confirmToken = jwt.sign({ userId: user.id }, JWT_SECRET, {
                expiresIn: "24h",
            });
            await sendConfirmationEmail(user, confirmToken);
            return {
                token: null, // user can’t log in until they confirm
                user,
            };
        },
        confirmEmail: async (_parent, { token }, context) => {
            // 1) verify the confirmation JWT
            let payload;
            try {
                payload = jwt.verify(token, JWT_SECRET);
            }
            catch (e) {
                throw new Error("Invalid or expired confirmation link");
            }
            const userId = payload.userId;
            // 2) flip the flag in the database
            const user = await context.prisma.user.update({
                where: { id: userId },
                data: { emailConfirmed: true },
            });
            // 3) now they’re “activated” → issue a real auth token
            const authToken = jwt.sign({ userId }, JWT_SECRET);
            return {
                token: authToken,
                user,
            };
        },
        login: async (_parent, args, context) => {
            const user = await context.prisma.user.findUnique({
                where: { email: args.email },
            });
            if (!user)
                notFoundError("User");
            const valid = await bcrypt.compare(args.password, user.password);
            if (!valid) {
                throw new Error("Invalid password");
            }
            if (!user.emailConfirmed) {
                // stop login here if they haven’t confirmed yet
                throw new Error("Please confirm your email before logging in");
            }
            const token = jwt.sign({ userId: user.id }, JWT_SECRET);
            return {
                token,
                user,
            };
        },
        resetPasswordRequest: async (_parent, args, context) => {
            const user = await context.prisma.user.findUnique({
                where: { email: args.email },
            });
            if (!user)
                notFoundError("User");
            const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
                expiresIn: "24h",
            });
            // Send email to user with url and token
            await sendPasswordResetEmail(user, token);
            console.log(`Email sent to user ${user.email} with url and token ${token}`);
            return { email: user.email };
        },
        resetPassword: async (parent, args, context) => {
            // Verify token and check if the user exist
            const { userId } = jwt.verify(args.token, JWT_SECRET);
            const userExists = !!(await context.prisma.user.findFirst({
                where: {
                    id: userId,
                },
            }));
            if (!userExists)
                notFoundError("User");
            // If no error, set new password.
            const newPassword = await bcrypt.hash(args.password, 10);
            const updatedUser = await context.prisma.user.update({
                where: { id: userId },
                data: { password: newPassword },
            });
            return updatedUser;
        },
        updateUser: secured(async (parent, args, context) => {
            return await context.prisma.user.update({
                where: {
                    id: args.id,
                },
                data: {
                    currency: args.currency,
                },
            });
        }),
        deleteAccount: secured(async (parent, args, context) => {
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
        }),
    },
    User: {
        id: (parent, args, context, info) => parent.id,
        email: (parent) => parent.email,
    },
};
