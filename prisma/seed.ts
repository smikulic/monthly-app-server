// prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const rolloverDate = "2025-01-02";

async function main() {
  // 1) Check if a demo user already exists
  const existingDemoUser = await prisma.user.findUnique({
    where: { email: "demo@example.com" },
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

  // 3) Create the demo user
  const hashedPassword = await bcrypt.hash("password123", 10);
  const demoUser = await prisma.user.create({
    data: {
      email: "demo@example.com",
      password: hashedPassword,
      emailConfirmed: true,
      currency: "EUR",
    },
  });

  // 4) Create Categories and Subcategories
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
      rolloverDate: new Date(rolloverDate).toISOString(),
      icon: "",
      category: { connect: { id: foodCategory.id } },
    },
  });

  const restaurantsSubcategory = await prisma.subcategory.create({
    data: {
      name: "Restaurants",
      budgetAmount: 200,
      rolloverDate: new Date(rolloverDate).toISOString(),
      icon: "",
      category: { connect: { id: foodCategory.id } },
    },
  });

  const moviesConcertsSubcategory = await prisma.subcategory.create({
    data: {
      name: "Movies & Concerts",
      budgetAmount: 150,
      rolloverDate: new Date(rolloverDate).toISOString(),
      icon: "",
      category: { connect: { id: entertainmentCategory.id } },
    },
  });

  const vacationSubcategory = await prisma.subcategory.create({
    data: {
      name: "Vacation",
      budgetAmount: 500,
      rolloverDate: new Date(rolloverDate).toISOString(),
      icon: "",
      category: { connect: { id: entertainmentCategory.id } },
    },
  });

  const coffeeDrinksSubcategory = await prisma.subcategory.create({
    data: {
      name: "Coffee & Drinks",
      budgetAmount: 100,
      rolloverDate: new Date(rolloverDate).toISOString(),
      icon: "",
      category: { connect: { id: entertainmentCategory.id } },
    },
  });

  // 5) Seed Expenses for January, February, March 2025 (up to 10 per month)
  async function createExpense(
    dateStr: string,
    amount: number,
    description: string,
    subcategoryId: string
  ) {
    await prisma.expense.create({
      data: {
        amount,
        date: new Date(dateStr).toISOString(),
        description,
        user: { connect: { id: demoUser.id } },
        subcategory: { connect: { id: subcategoryId } },
      },
    });
  }

  // January 2025 (10 entries)
  await createExpense(
    "2025-01-02",
    45,
    "Supermarket A",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-01-05",
    20,
    "Local Market",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-01-08",
    60,
    "Restaurant X",
    restaurantsSubcategory.id
  );
  await createExpense(
    "2025-01-10",
    15,
    "Coffee Shop",
    coffeeDrinksSubcategory.id
  );
  await createExpense(
    "2025-01-12",
    12,
    "Evening Cafe",
    coffeeDrinksSubcategory.id
  );
  await createExpense(
    "2025-01-15",
    120,
    "Movie Night",
    moviesConcertsSubcategory.id
  );
  await createExpense(
    "2025-01-18",
    600,
    "Vacation Booking",
    vacationSubcategory.id
  );
  await createExpense(
    "2025-01-20",
    25,
    "Supermarket B",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-01-22",
    30,
    "Restaurant Y",
    restaurantsSubcategory.id
  );
  await createExpense(
    "2025-01-25",
    8,
    "Morning Coffee",
    coffeeDrinksSubcategory.id
  );

  // February 2025 (10 entries)
  await createExpense(
    "2025-02-01",
    50,
    "Supermarket C",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-02-03",
    22,
    "Local Market B",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-02-05",
    65,
    "Restaurant Z",
    restaurantsSubcategory.id
  );
  await createExpense(
    "2025-02-07",
    10,
    "Coffee Shop B",
    coffeeDrinksSubcategory.id
  );
  await createExpense(
    "2025-02-09",
    9,
    "Evening Cafe B",
    coffeeDrinksSubcategory.id
  );
  await createExpense(
    "2025-02-11",
    130,
    "Concert Ticket",
    moviesConcertsSubcategory.id
  );
  await createExpense(
    "2025-02-14",
    550,
    "Vacation Deposit",
    vacationSubcategory.id
  );
  await createExpense(
    "2025-02-16",
    28,
    "Supermarket D",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-02-18",
    35,
    "Restaurant W",
    restaurantsSubcategory.id
  );
  await createExpense(
    "2025-02-20",
    12,
    "Afternoon Coffee",
    coffeeDrinksSubcategory.id
  );

  // March 2025 (10 entries)
  await createExpense(
    "2025-03-02",
    40,
    "Supermarket E",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-03-04",
    18,
    "Local Market C",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-03-06",
    70,
    "Restaurant Q",
    restaurantsSubcategory.id
  );
  await createExpense(
    "2025-03-08",
    11,
    "Coffee Shop C",
    coffeeDrinksSubcategory.id
  );
  await createExpense(
    "2025-03-10",
    14,
    "Evening Cafe C",
    coffeeDrinksSubcategory.id
  );
  await createExpense(
    "2025-03-12",
    140,
    "Theater Play",
    moviesConcertsSubcategory.id
  );
  await createExpense(
    "2025-03-15",
    650,
    "Vacation Final Payment",
    vacationSubcategory.id
  );
  await createExpense(
    "2025-03-18",
    30,
    "Supermarket F",
    groceriesSubcategory.id
  );
  await createExpense(
    "2025-03-20",
    40,
    "Restaurant R",
    restaurantsSubcategory.id
  );
  await createExpense(
    "2025-03-22",
    10,
    "Morning Coffee D",
    coffeeDrinksSubcategory.id
  );

  // 6) Add one SavingGoal
  await prisma.savingGoal.create({
    data: {
      name: "Vacation Fund",
      goalDate: new Date("2025-12-31").toISOString(),
      goalAmount: 2000,
      initialSaveAmount: 100,
      user: { connect: { id: demoUser.id } },
    },
  });

  console.log(
    "✅ Seed completed: demo user + 3 months of expenses + sample data created."
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
