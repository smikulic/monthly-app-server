import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";
import { WritableStreamBuffer } from "stream-buffers";
import postmark from "postmark";
import "dotenv/config";
import { ensureAuthenticated, notFoundError } from "../utils.js";

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
    generateReport: async (parent, { year }, context) => {
      ensureAuthenticated(context.currentUser);

      const { prisma, currentUser } = context;

      const userId = currentUser.id;

      // ————————— Data Aggregation (unchanged) —————————
      const start = new Date(year, 0, 1),
        end = new Date(year + 1, 0, 1);

      // 1) Monthly expenses
      const expenses = await prisma.expense.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { date: true, amount: true },
      });
      const monthlyExpenses = Array(12).fill(0);
      expenses.forEach(({ date, amount }) => {
        const m = date.getMonth(); // 0 = Jan, 11 = Dec
        monthlyExpenses[m] += amount; // accumulate every expense in its month
      });

      // 2) Monthly budget
      const subs = await prisma.subcategory.findMany({
        where: { category: { userId } },
        select: { budgetAmount: true },
      });
      const totalMonthlyBudget = subs.reduce(
        (sum, s) => sum + s.budgetAmount,
        0
      );
      const monthlyBudgets = Array(12).fill(totalMonthlyBudget);

      // 3) Category breakdown
      const rawCat = await prisma.expense.groupBy({
        by: ["subcategoryId"],
        where: { userId, date: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      const catMap = {};
      await Promise.all(
        rawCat.map(async (r) => {
          const sub = await prisma.subcategory.findUnique({
            where: { id: r.subcategoryId },
            select: {
              name: true,
              budgetAmount: true,
              category: { select: { name: true } },
            },
          });
          catMap[`${sub.category.name} / ${sub.name}`] = {
            spent: r._sum.amount ?? 0,
            budget: sub.budgetAmount,
          };
        })
      );

      // ————————— PDF Generation —————————
      return await new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ size: "A4", margin: 40 });
          const stream = new WritableStreamBuffer({
            initialSize: 100 * 1024,
            incrementAmount: 10 * 1024,
          });
          doc.pipe(stream);

          // — Header Bar —
          const pageWidth =
            doc.page.width - doc.page.margins.left - doc.page.margins.right;
          doc.rect(doc.x, doc.y - 8, pageWidth, 30).fill("#277bc0");
          doc
            .fillColor("#ffffff")
            .fontSize(18)
            .font("Helvetica-Bold")
            .text(`MonthlyApp - Budget Report — ${year}`, {
              align: "center",
              valign: "center",
              lineGap: 6,
            });
          doc.moveDown(2);
          doc.fillColor("#000000"); // reset for body

          // — Overview —
          const totalExp = monthlyExpenses.reduce(
            (sum, monthVal) => sum + monthVal,
            0
          );
          const totalBud = monthlyBudgets.reduce((a, b) => a + b, 0);
          const pctUsed = ((totalExp / totalBud) * 100).toFixed(1);
          doc
            .fontSize(12)
            .font("Helvetica")
            .text(`Total Spent:`, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(` ${totalExp}€`, { continued: true })
            .font("Helvetica")
            .text(`   |   Total Budget:`, { continued: true })
            .font("Helvetica-Bold")
            .text(` ${totalBud}€`, { continued: true })
            .font("Helvetica")
            .text(`   |   Used:`, { continued: true })
            .font("Helvetica-Bold")
            .text(` ${pctUsed}%`);
          doc.moveDown(1.5);

          // — Category Breakdown —
          // doc.addPage();
          const rowHeight = 20;
          doc.fontSize(14).font("Helvetica-Bold").text("Category Breakdown");
          doc.moveDown(0.5);
          doc.fontSize(10).font("Helvetica");
          Object.entries(catMap).forEach(([cat, { spent, budget }], idx) => {
            const y = doc.y;
            if (idx % 2 === 0) {
              doc
                .rect(50, y, pageWidth, rowHeight)
                .fill("#f5f5f5")
                .fillColor("#000");
            }
            doc
              .text(cat, 55, y + 5, { width: 200 })
              .text(`${spent}€`, 265, y + 5)
              .text(`${budget}€`, 345, y + 5)
              .text(`${budget - spent}€`, 425, y + 5);
            doc.moveDown(1);
          });
          doc.fillColor("#000");
          doc.moveDown(1);

          // Finalize
          doc.end();
          stream.on("finish", () => {
            const b64 = stream.getContentsAsString("base64");
            if (!b64) return reject(new Error("PDF generation failed"));
            resolve(b64);
          });
          stream.on("error", (err) => reject(err));
        } catch (err) {
          reject(err);
        }
      });
    },
  },
  Mutation: {
    signup: async (parent, args, context) => {
      const password = await bcrypt.hash(args.password, 10);

      const user = await context.prisma.user.create({
        data: { ...args, password },
      });

      const confirmToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      client.sendEmailWithTemplate({
        From: "support@yourmonthly.app",
        To: user.email,
        TemplateAlias: "email-confirmation",
        TemplateModel: {
          product_name: "Monthly App",
          action_url: `https://app.yourmonthly.app/confirm-email?token=${confirmToken}`,
          support_url: "support@yourmonthly.app",
        },
        MessageStream: "outbound",
      });
      console.log(
        `Confirmation email sent to ${user.email} and confirmToken ${confirmToken}`
      );

      // const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

      return {
        token: null, // user can’t log in until they confirm
        user,
      };
    },
    confirmEmail: async (parent, { token }, context) => {
      // 1) verify the confirmation JWT
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (e) {
        throw new Error("Invalid or expired confirmation link");
      }

      const userId = payload.userId;
      // 2) flip the flag in the database
      const user = await context.prisma.user.update({
        where: { id: userId },
        data: { emailConfirmed: true },
      });

      // 3) now they’re “activated” → issue a real auth token
      const authToken = jwt.sign({ userId }, process.env.JWT_SECRET);

      return {
        token: authToken,
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

      if (!user.emailConfirmed) {
        // stop login here if they haven’t confirmed yet
        throw new Error("Please confirm your email before logging in");
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
