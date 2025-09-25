import bcrypt from "bcryptjs";
import "dotenv/config";
import { notFoundError } from "../utils/notFoundError.js";
import { secured } from "../utils/secured.js";
import {
  sendConfirmationEmail,
  sendPasswordResetEmail,
} from "../helpers/emails.js";
import { generateBudgetReportPdf } from "../helpers/reports.js";
import {
  validateEmail,
  validatePassword,
  sanitizeString,
} from "../utils/validation.js";
import {
  getGoogleAuthUrl,
  getGoogleUserInfo,
  findOrCreateGoogleUser,
} from "../helpers/googleOAuth.js";
import { generateAuthToken, verifyToken } from "../helpers/auth.js";
import { JwtPayload } from "../authenticateUser.js";

export const userResolvers = {
  Query: {
    users: secured((parent: any, args: any, context: any) => {
      // Only allow admin users or return empty array for security
      return [];
    }),
    user: secured((parent: any, args: any, context: any) => {
      // Users can only query their own profile
      if (args.id !== context.currentUser.id) {
        throw new Error("Unauthorized: You can only access your own profile");
      }
      return context.prisma.user.findFirst({
        where: { id: args.id },
      });
    }),
    me: secured((parent, args, context) => {
      return context.currentUser;
    }),
    generateReport: secured(async (_parent: unknown, { year }, context) => {
      const { prisma, currentUser } = context;
      const userId = currentUser.id;
      return generateBudgetReportPdf(prisma, userId, year);
    }),
    googleAuthUrl: () => {
      return {
        url: getGoogleAuthUrl(),
      };
    },
  },
  Mutation: {
    signup: async (_parent: unknown, args: any, context: any) => {
      // Validate email
      const emailValidation = validateEmail(args.email);
      if (!emailValidation.isValid) {
        throw new Error(
          `Email validation failed: ${emailValidation.errors.join(", ")}`
        );
      }

      // Validate password
      const passwordValidation = validatePassword(args.password);
      if (!passwordValidation.isValid) {
        throw new Error(
          `Password validation failed: ${passwordValidation.errors.join(", ")}`
        );
      }

      // Sanitize email (normalize)
      const sanitizedEmail = args.email.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await context.prisma.user.findUnique({
        where: { email: sanitizedEmail },
      });

      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      const hashedPassword = await bcrypt.hash(args.password, 10);

      const user = await context.prisma.user.create({
        data: {
          email: sanitizedEmail,
          password: hashedPassword,
          currency: args.currency ? sanitizeString(args.currency, 10) : null,
          provider: "email",
        },
      });

      const confirmToken = generateAuthToken(user.id, "24h");

      await sendConfirmationEmail(user, confirmToken);

      return {
        token: null, // user can’t log in until they confirm
        user,
      };
    },
    confirmEmail: async (
      _parent: unknown,
      { token }: { token: string },
      context: any
    ) => {
      // 1) verify the confirmation JWT
      let payload: JwtPayload;
      try {
        payload = verifyToken(token);
      } catch (e) {
        throw new Error("Invalid or expired confirmation link");
      }

      const userId = payload.userId;
      // 2) flip the flag in the database
      const user = await context.prisma.user.update({
        where: { id: userId },
        data: { emailConfirmed: true },
      });

      // 3) now they're "activated" → issue a real auth token
      const authToken = generateAuthToken(userId, "7d");

      return {
        token: authToken,
        user,
      };
    },
    login: async (_parent: unknown, args: any, context: any) => {
      // Validate email format
      const emailValidation = validateEmail(args.email);
      if (!emailValidation.isValid) {
        throw new Error("Invalid email format");
      }

      const sanitizedEmail = args.email.toLowerCase().trim();

      const user = await context.prisma.user.findUnique({
        where: { email: sanitizedEmail },
      });
      if (!user) notFoundError("User");

      // Check if user signed up with OAuth only (no password set)
      if (!user.password) {
        throw new Error(
          "This account uses Google sign-in. Please use the 'Sign in with Google' button instead."
        );
      }

      const valid = await bcrypt.compare(args.password, user.password);
      if (!valid) {
        throw new Error("Invalid password");
      }

      if (!user.emailConfirmed) {
        // stop login here if they haven't confirmed yet
        throw new Error("Please confirm your email before logging in");
      }

      const token = generateAuthToken(user.id);

      return {
        token,
        user,
      };
    },
    googleLogin: async (
      _parent: unknown,
      { code }: { code: string },
      context: any
    ) => {
      try {
        // Get user info from Google
        const googleUser = await getGoogleUserInfo(code);

        // Find or create user in our database
        const user = await findOrCreateGoogleUser(context.prisma, googleUser);

        // Generate auth token
        const token = generateAuthToken(user.id);

        return {
          token,
          user,
        };
      } catch (error: any) {
        console.error("Google login error:", error);
        throw new Error(`Google login failed: ${error.message}`);
      }
    },
    resetPasswordRequest: async (_parent: unknown, args: any, context: any) => {
      const user = await context.prisma.user.findUnique({
        where: { email: args.email },
      });

      if (!user) notFoundError("User");

      // Check if user signed up with OAuth only (no password)
      if (!user.password && user.provider === "google") {
        throw new Error(
          "This account uses Google sign-in. Please use the 'Sign in with Google' button instead."
        );
      }

      const token = generateAuthToken(user.id, "24h");

      // Send email to user with url and token
      await sendPasswordResetEmail(user, token);

      console.log(`Password reset email sent to user ${user.email}`);

      return { email: user.email };
    },
    resetPassword: async (parent: any, args: any, context: any) => {
      // Verify token and check if the user exist
      const { userId } = verifyToken(args.token);

      const user = await context.prisma.user.findFirst({
        where: {
          id: userId,
        },
      });

      if (!user) notFoundError("User");

      // Check if user is OAuth-only
      if (!user.password && user.provider === "google") {
        throw new Error(
          "Cannot reset password for Google sign-in accounts. Please use 'Sign in with Google' instead."
        );
      }

      // If no error, set new password.
      const newPassword = await bcrypt.hash(args.password, 10);

      const updatedUser = await context.prisma.user.update({
        where: { id: userId },
        data: { password: newPassword },
      });

      return updatedUser;
    },
    setPassword: secured(async (_parent: unknown, args: any, context: any) => {
      const userId = context.currentUser.id;

      // Validate password
      const passwordValidation = validatePassword(args.password);
      if (!passwordValidation.isValid) {
        throw new Error(
          `Password validation failed: ${passwordValidation.errors.join(", ")}`
        );
      }

      // Check if user already has a password
      const user = await context.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) notFoundError("User");

      if (user.password) {
        throw new Error(
          "Password already set. Use password reset if you want to change it."
        );
      }

      // Hash and set the password
      const hashedPassword = await bcrypt.hash(args.password, 10);

      const updatedUser = await context.prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          provider: "both", // User can now use both OAuth and email/password
        },
      });

      return updatedUser;
    }),
    updateUser: secured(async (parent, args, context) => {
      // Ensure user can only update their own profile
      if (args.id !== context.currentUser.id) {
        throw new Error("Unauthorized: You can only update your own profile");
      }

      return await context.prisma.user.update({
        where: {
          id: args.id,
        },
        data: {
          currency: args.currency,
          weeklyReminder: args.weeklyReminder,
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

        // c) remove all investments for this user
        context.prisma.investment.deleteMany({ where: { userId } }),

        // d) remove all subcategories whose categoryId is in categoryIds
        //    (if categoryIds is empty, Prisma simply does nothing)
        context.prisma.subcategory.deleteMany({
          where: { categoryId: { in: categoryIds } },
        }),

        // e) now remove all categories for this user
        context.prisma.category.deleteMany({ where: { userId } }),

        // f) finally, delete the user record itself
        context.prisma.user.delete({ where: { id: userId } }),
      ]);

      // 4. Let the client know it worked
      return true;
    }),
  },
  User: {
    id: (parent: any, args: any, context: any, info: any) => parent.id,
    email: (parent: any) => parent.email,
    provider: (parent: any) => parent.provider,
    name: (parent: any) => parent.name,
    picture: (parent: any) => parent.picture,
  },
};
