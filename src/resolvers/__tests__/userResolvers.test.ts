// src/resolvers/__tests__/userResolvers.test.ts

/**
 * Set any required environment variables before importing modules that rely on them.
 * For example, userResolvers indirectly imports 'dotenv/config' and uses POSTMARK_API_KEY and JWT_SECRET.
 */
process.env.POSTMARK_API_KEY = "dummy-postmark-key";
process.env.JWT_SECRET = "dummy-jwt-secret";

/**
 * Mock 'postmark' so that instantiating ServerClient never fails.
 */
jest.mock("postmark", () => ({
  ServerClient: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue({}),
  })),
}));

/**
 * Mock the email helpers before importing userResolvers.
 */
jest.mock("../../helpers/emails", () => ({
  sendConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("bcryptjs");
jest.mock("jsonwebtoken");
jest.mock("../../helpers/reports");

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { userResolvers } from "../userResolvers";
import {
  sendConfirmationEmail,
  sendPasswordResetEmail,
} from "../../helpers/emails";
import { generateBudgetReportPdf } from "../../helpers/reports";

describe("userResolvers", () => {
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
    password: "hashedpass",
    currency: "USD",
  };
  const dummyInfo = {} as any;

  let prismaMock: any;
  let context: any;

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      expense: {
        deleteMany: jest.fn(),
      },
      savingGoal: {
        deleteMany: jest.fn(),
      },
      subcategory: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    context = {
      currentUser: dummyUser,
      prisma: prismaMock,
    };
  });

  describe("Query.users", () => {
    it("returns array of users from prisma.findMany", async () => {
      const fakeUsers = [{ id: "u1" }, { id: "u2" }];
      prismaMock.user.findMany.mockResolvedValue(fakeUsers);

      // 'users' is not secured → 3 args
      const result = await userResolvers.Query.users(null, {}, context, dummyInfo);

      expect(result).toEqual([]);
    });
  });

  describe("Query.user", () => {
    it("returns a user when accessing own profile", async () => {
      const fakeUser = { id: dummyUser.id, email: "a@b.com" };
      prismaMock.user.findFirst.mockResolvedValue(fakeUser);

      const args = { id: dummyUser.id };
      const result = await userResolvers.Query.user(null, args, context, dummyInfo);

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: args.id },
      });
      expect(result).toBe(fakeUser);
    });

    it("throws error when trying to access another user's profile", async () => {
      const args = { id: "other-user-id" };

      await expect(
        userResolvers.Query.user(null, args, context, dummyInfo)
      ).rejects.toThrow("Unauthorized: You can only access your own profile");
    });
  });

  describe("Query.generateReport", () => {
    it("calls generateBudgetReportPdf with correct args and returns its result", async () => {
      const fakePdf = Buffer.from("PDF");
      (generateBudgetReportPdf as jest.Mock).mockResolvedValue(fakePdf);

      const args = { year: 2022 };
      // 'generateReport' is secured → 4 args
      const result = await userResolvers.Query.generateReport(
        null,
        args,
        context,
        dummyInfo
      );

      expect(generateBudgetReportPdf).toHaveBeenCalledWith(
        prismaMock,
        dummyUser.id,
        args.year
      );
      expect(result).toBe(fakePdf);
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      await expect(
        userResolvers.Query.generateReport(
          null,
          { year: 2022 },
          badContext,
          dummyInfo
        )
      ).rejects.toThrowError("Unauthenticated!");
    });
  });

  describe("Mutation.signup", () => {
    it("hashes password, creates user, sends confirmation email, and returns correct payload", async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashedpwd");
      const createdUser = { ...dummyUser, id: "new-id" };
      prismaMock.user.findUnique.mockResolvedValue(null); // No existing user
      prismaMock.user.create.mockResolvedValue(createdUser);
      (jwt.sign as jest.Mock).mockReturnValue("conf-token");

      const args = {
        email: "new@user.com",
        password: "StrongPass123",
        currency: "EUR",
      };
      // 'signup' is not secured → 3 args
      const result = await userResolvers.Mutation.signup(null, args, context);

      expect(bcrypt.hash).toHaveBeenCalledWith(args.password, 10);
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: { 
          email: "new@user.com",
          password: "hashedpwd",
          currency: "EUR"
        },
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: createdUser.id },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );
      expect(sendConfirmationEmail).toHaveBeenCalledWith(
        createdUser,
        "conf-token"
      );
      expect(result).toEqual({ token: null, user: createdUser });
    });
  });

  describe("Mutation.confirmEmail", () => {
    it("verifies token, updates user, signs auth token, and returns payload", async () => {
      const fakePayload = { userId: "u1" };
      (jwt.verify as jest.Mock).mockReturnValue(fakePayload);
      const updatedUser = { ...dummyUser, emailConfirmed: true };
      prismaMock.user.update.mockResolvedValue(updatedUser);
      (jwt.sign as jest.Mock).mockReturnValue("auth-token");

      const args = { token: "valid-token" };
      // 'confirmEmail' is not secured → 3 args
      const result = await userResolvers.Mutation.confirmEmail(
        null,
        args,
        context
      );

      expect(jwt.verify).toHaveBeenCalledWith(
        args.token,
        process.env.JWT_SECRET
      );
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: fakePayload.userId },
        data: { emailConfirmed: true },
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: fakePayload.userId },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      expect(result).toEqual({ token: "auth-token", user: updatedUser });
    });

    it("throws on invalid or expired token", async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error();
      });
      await expect(
        userResolvers.Mutation.confirmEmail(null, { token: "bad" }, context)
      ).rejects.toThrowError("Invalid or expired confirmation link");
    });
  });

  describe("Mutation.login", () => {
    const args = { email: "a@b.com", password: "plain" };

    it("throws if user not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(
        userResolvers.Mutation.login(null, args, context)
      ).rejects.toThrowError("No such User found");
    });

    it("throws if password invalid", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...dummyUser,
        password: "hashed",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        userResolvers.Mutation.login(null, args, context)
      ).rejects.toThrowError("Invalid password");
    });

    it("throws if email not confirmed", async () => {
      const unconfirmed = {
        ...dummyUser,
        password: "hashed",
        emailConfirmed: false,
      };
      prismaMock.user.findUnique.mockResolvedValue(unconfirmed);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(
        userResolvers.Mutation.login(null, args, context)
      ).rejects.toThrowError("Please confirm your email before logging in");
    });

    it("returns token and user on success", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...dummyUser,
        password: "hashed",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue("login-token");

      const result = await userResolvers.Mutation.login(null, args, context);
      
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: "a@b.com" },
      });
      expect(result).toEqual({
        token: "login-token",
        user: { ...dummyUser, password: "hashed" },
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: dummyUser.id },
        process.env.JWT_SECRET,
        { expiresIn: "90d" }
      );
    });
  });

  describe("Mutation.resetPasswordRequest", () => {
    it("throws if user not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(
        userResolvers.Mutation.resetPasswordRequest(
          null,
          { email: "no@one.com" },
          context
        )
      ).rejects.toThrowError("No such User found");
    });

    it("signs token, sends email, and returns email", async () => {
      const foundUser = { ...dummyUser };
      prismaMock.user.findUnique.mockResolvedValue(foundUser);
      (jwt.sign as jest.Mock).mockReturnValue("reset-token");

      const result = await userResolvers.Mutation.resetPasswordRequest(
        null,
        { email: "test@example.com" },
        context
      );

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: foundUser.id },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        foundUser,
        "reset-token"
      );
      expect(result).toEqual({ email: foundUser.email });
    });
  });

  describe("Mutation.resetPassword", () => {
    it("throws if user not found after verifying token", async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ userId: "u1" });
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        userResolvers.Mutation.resetPassword(
          null,
          { token: "tok", password: "new" },
          context
        )
      ).rejects.toThrowError("No such User found");
    });

    it("hashes new password, updates user, and returns updated user", async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ userId: "u1" });
      prismaMock.user.findFirst.mockResolvedValue(dummyUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      const updatedUser = { ...dummyUser, password: "newhashed" };
      prismaMock.user.update.mockResolvedValue(updatedUser);

      const result = await userResolvers.Mutation.resetPassword(
        null,
        { token: "tok", password: "newpass" },
        context
      );

      expect(bcrypt.hash).toHaveBeenCalledWith("newpass", 10);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { password: "newhashed" },
      });
      expect(result).toBe(updatedUser);
    });
  });

  describe("Mutation.updateUser", () => {
    it("updates currency and returns updated user", async () => {
      const updated = { ...dummyUser, currency: "EUR" };
      prismaMock.user.update.mockResolvedValue(updated);

      const args = { id: dummyUser.id, currency: "EUR" };
      // 'updateUser' is secured → 4 args
      const result = await userResolvers.Mutation.updateUser(
        null,
        args,
        context,
        dummyInfo
      );

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: args.id },
        data: { currency: args.currency },
      });
      expect(result).toBe(updated);
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      await expect(
        userResolvers.Mutation.updateUser(
          null,
          { id: "u", currency: "EUR" },
          badContext,
          dummyInfo
        )
      ).rejects.toThrowError("Unauthenticated!");
    });
  });

  describe("Mutation.deleteAccount", () => {
    it("runs transaction steps in correct order and returns true", async () => {
      const categories = [{ id: "c1" }, { id: "c2" }];
      prismaMock.category.findMany.mockResolvedValue(categories);
      prismaMock.$transaction.mockResolvedValue([null, null, null, null, null]);

      // 'deleteAccount' is secured → 4 args
      const result = await userResolvers.Mutation.deleteAccount(
        null,
        {},
        context,
        dummyInfo
      );

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { userId: dummyUser.id },
        select: { id: true },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledWith([
        prismaMock.expense.deleteMany({ where: { userId: dummyUser.id } }),
        prismaMock.savingGoal.deleteMany({ where: { userId: dummyUser.id } }),
        prismaMock.subcategory.deleteMany({
          where: { categoryId: { in: ["c1", "c2"] } },
        }),
        prismaMock.category.deleteMany({ where: { userId: dummyUser.id } }),
        prismaMock.user.delete({ where: { id: dummyUser.id } }),
      ]);
      expect(result).toBe(true);
    });

    it("throws if not authenticated", async () => {
      const badContext = { ...context, currentUser: null };
      await expect(
        userResolvers.Mutation.deleteAccount(null, {}, badContext, dummyInfo)
      ).rejects.toThrowError("Unauthenticated!");
    });
  });

  describe("User field resolvers", () => {
    const parent = { id: "u123", email: "foo@bar.com" };

    it("id returns parent.id", () => {
      expect(userResolvers.User.id(parent, {}, context, dummyInfo)).toBe(
        "u123"
      );
    });

    it("email returns parent.email", () => {
      expect(userResolvers.User.email(parent)).toBe("foo@bar.com");
    });
  });
});
