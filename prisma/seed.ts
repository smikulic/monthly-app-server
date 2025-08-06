// prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const rolloverDate = "2025-01-05";
const [y, m, d] = rolloverDate.split("-").map(Number);
const dateForStorage = new Date(Date.UTC(y, m - 1, d));

async function main() {
  // 1) Check if demo users already exist
  const existingDemoUser = await prisma.user.findUnique({
    where: { email: "demo@example.com" },
    select: { id: true },
  });

  const existingMonthlyUser = await prisma.user.findUnique({
    where: { email: "demo@monthly.com" },
    select: { id: true },
  });

  // 2) If demo user exists, delete all related data first
  if (existingDemoUser) {
    const userId = existingDemoUser.id;

    // Delete expenses (owned directly by the user)
    await prisma.expense.deleteMany({
      where: { userId },
    });

    // Delete saving goals
    await prisma.savingGoal.deleteMany({
      where: { userId },
    });

    // Delete investments
    await prisma.investment.deleteMany({
      where: { userId },
    });

    // Fetch all categories belonging to demo user
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true },
    });
    const categoryIds = categories.map((c) => c.id);

    // Delete subcategories under those categories
    if (categoryIds.length) {
      await prisma.subcategory.deleteMany({
        where: { categoryId: { in: categoryIds } },
      });
    }

    // Delete categories
    await prisma.category.deleteMany({
      where: { userId },
    });

    // Finally, delete the user
    await prisma.user.delete({
      where: { id: userId },
    });
  }

  // 3) If monthly demo user exists, delete all related data first
  if (existingMonthlyUser) {
    const userId = existingMonthlyUser.id;

    // Delete expenses (owned directly by the user)
    await prisma.expense.deleteMany({
      where: { userId },
    });

    // Delete saving goals
    await prisma.savingGoal.deleteMany({
      where: { userId },
    });

    // Delete investments
    await prisma.investment.deleteMany({
      where: { userId },
    });

    // Fetch all categories belonging to monthly demo user
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true },
    });
    const categoryIds = categories.map((c) => c.id);

    // Delete subcategories under those categories
    if (categoryIds.length) {
      await prisma.subcategory.deleteMany({
        where: { categoryId: { in: categoryIds } },
      });
    }

    // Delete categories
    await prisma.category.deleteMany({
      where: { userId },
    });

    // Finally, delete the user
    await prisma.user.delete({
      where: { id: userId },
    });
  }

  // 4) Create the demo user
  const hashedPassword = await bcrypt.hash("password123", 10);
  const demoUser = await prisma.user.create({
    data: {
      email: "demo@example.com",
      password: hashedPassword,
      emailConfirmed: true,
      currency: "EUR",
    },
  });

  // 5) Create the monthly demo user
  const hashedPasswordMonthly = await bcrypt.hash("Admin1234", 10);
  await prisma.user.create({
    data: {
      email: "demo@monthly.com",
      password: hashedPasswordMonthly,
      emailConfirmed: true,
      currency: "EUR",
    },
  });

  // 6) Create Categories and Subcategories
  const foodCategory = await prisma.category.create({
    data: {
      name: "Food",
      icon: "",
      user: { connect: { id: demoUser.id } },
    },
  });

  const entertainmentCategory = await prisma.category.create({
    data: {
      name: "Entertainment",
      icon: "",
      user: { connect: { id: demoUser.id } },
    },
  });

  const groceriesSubcategory = await prisma.subcategory.create({
    data: {
      name: "Groceries",
      budgetAmount: 300,
      rolloverDate: dateForStorage,
      icon: "",
      category: { connect: { id: foodCategory.id } },
    },
  });

  const restaurantsSubcategory = await prisma.subcategory.create({
    data: {
      name: "Restaurants",
      budgetAmount: 200,
      rolloverDate: dateForStorage,
      icon: "",
      category: { connect: { id: foodCategory.id } },
    },
  });

  const moviesConcertsSubcategory = await prisma.subcategory.create({
    data: {
      name: "Movies & Concerts",
      budgetAmount: 150,
      rolloverDate: dateForStorage,
      icon: "",
      category: { connect: { id: entertainmentCategory.id } },
    },
  });

  const vacationSubcategory = await prisma.subcategory.create({
    data: {
      name: "Vacation",
      budgetAmount: 500,
      rolloverDate: dateForStorage,
      icon: "",
      category: { connect: { id: entertainmentCategory.id } },
    },
  });

  const coffeeDrinksSubcategory = await prisma.subcategory.create({
    data: {
      name: "Coffee & Drinks",
      budgetAmount: 100,
      rolloverDate: dateForStorage,
      icon: "",
      category: { connect: { id: entertainmentCategory.id } },
    },
  });

  // 7) Seed Expenses for current month and 5 previous months (up to 10 per month)
  async function createExpense(
    dateStr: string,
    amount: number,
    description: string,
    subcategoryId: string
  ) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateForStorage = new Date(Date.UTC(y, m - 1, d));
    await prisma.expense.create({
      data: {
        amount,
        date: dateForStorage,
        description,
        user: { connect: { id: demoUser.id } },
        subcategory: { connect: { id: subcategoryId } },
      },
    });
  }

  // Generate expenses for current month and 5 previous months
  const currentDate = new Date();
  const months = [] as Date[];

  // Generate 6 months (current + 5 previous)
  for (let i = 0; i < 6; i++) {
    const date = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - i,
      1
    );
    months.push(date);
  }

  // Expense templates with varied amounts and descriptions
  const expenseTemplates = [
    {
      base: "Supermarket",
      amounts: [40, 45, 50, 35, 55],
      subcategory: groceriesSubcategory.id,
    },
    {
      base: "Local Market",
      amounts: [18, 20, 22, 25, 28],
      subcategory: groceriesSubcategory.id,
    },
    {
      base: "Restaurant",
      amounts: [60, 65, 70, 55, 75],
      subcategory: restaurantsSubcategory.id,
    },
    {
      base: "Coffee Shop",
      amounts: [10, 11, 12, 15, 9],
      subcategory: coffeeDrinksSubcategory.id,
    },
    {
      base: "Evening Cafe",
      amounts: [9, 12, 14, 11, 13],
      subcategory: coffeeDrinksSubcategory.id,
    },
    {
      base: "Entertainment",
      amounts: [120, 130, 140, 110, 150],
      subcategory: moviesConcertsSubcategory.id,
    },
    {
      base: "Vacation",
      amounts: [500, 550, 600, 650, 450],
      subcategory: vacationSubcategory.id,
    },
  ];

  const suffixes = ["A", "B", "C", "D", "E", "F"];

  for (const month of months) {
    const year = month.getFullYear();
    const monthNum = month.getMonth() + 1;

    // Generate 10 expenses per month
    for (let expenseIndex = 0; expenseIndex < 10; expenseIndex++) {
      const templateIndex = expenseIndex % expenseTemplates.length;
      const template = expenseTemplates[templateIndex];
      const amountIndex = expenseIndex % template.amounts.length;
      const suffixIndex = expenseIndex % suffixes.length;

      // Generate random day between 1-28 to avoid month-end issues
      const day = Math.floor(Math.random() * 28) + 1;
      const dateStr = `${year}-${monthNum.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}`;

      await createExpense(
        dateStr,
        template.amounts[amountIndex],
        `${template.base} ${suffixes[suffixIndex]}`,
        template.subcategory
      );
    }
  }

  const [y, m, d] = "2025-12-31".split("-").map(Number);
  const goalDateOne = new Date(Date.UTC(y, m - 1, d));
  const [y2, m2, d2] = "2020-06-15".split("-").map(Number);
  const startDateOne = new Date(Date.UTC(y2, m2 - 1, d2));
  const [y3, m3, d3] = "2022-01-10".split("-").map(Number);
  const startDateTwo = new Date(Date.UTC(y3, m3 - 1, d3));
  const [y4, m4, d4] = "2023-03-20".split("-").map(Number);
  const startDateThree = new Date(Date.UTC(y4, m4 - 1, d4));

  // 8) Add one SavingGoal
  await prisma.savingGoal.create({
    data: {
      name: "Vacation Fund",
      goalDate: goalDateOne,
      goalAmount: 2000,
      initialSaveAmount: 100,
      user: { connect: { id: demoUser.id } },
    },
  });

  // 9) Add sample investments
  const investments = [
    {
      name: "House",
      amount: 350000,
      currency: "EUR",
      quantity: 1,
      startDate: startDateOne,
      initialAmount: 320000,
    },
    {
      name: "S&P ETF",
      amount: 12500,
      currency: "EUR",
      quantity: 50,
      startDate: startDateTwo,
      initialAmount: 10000,
    },
    {
      name: "Reddit Stock",
      amount: 6250,
      currency: "EUR",
      quantity: 25,
      startDate: startDateThree,
      initialAmount: 5000,
    },
  ];

  for (const investment of investments) {
    await prisma.investment.create({
      data: {
        name: investment.name,
        amount: investment.amount,
        currency: investment.currency,
        quantity: investment.quantity,
        startDate: investment.startDate,
        initialAmount: investment.initialAmount,
        user: { connect: { id: demoUser.id } },
      },
    });
  }

  console.log(
    "Seed completed: demo users + 6 months of expenses + investments + sample data created."
  );
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
