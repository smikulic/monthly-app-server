import { PrismaClient } from "@prisma/client";
import {
  sanitizeString,
  validatePositiveInteger,
} from "../utils/validation.js";

export type ImportMode = "MERGE" | "REPLACE";

const EXPORT_VERSION = 1;

export type ImportResult = {
  categories: number;
  subcategories: number;
  expenses: number;
  savingGoals: number;
  investments: number;
};

// ---- Validation / normalization (pure; throws on the first problem) ----

const fail = (msg: string): never => {
  throw new Error(`Import failed: ${msg}`);
};

const asArray = (value: unknown, name: string): any[] =>
  Array.isArray(value) ? value : fail(`"${name}" must be a list`);

const reqId = (value: unknown, entity: string): string =>
  typeof value === "string" && value.trim() !== ""
    ? value
    : fail(`a ${entity} is missing a valid id`);

const reqName = (value: unknown, entity: string): string =>
  typeof value === "string" && value.trim() !== ""
    ? sanitizeString(value, 100)
    : fail(`a ${entity} is missing a name`);

const reqInt = (value: unknown, field: string): number => {
  const result = validatePositiveInteger(value, field);
  return result.isValid ? (value as number) : fail(result.errors.join(", "));
};

const reqDate = (value: unknown, field: string): Date => {
  if (typeof value !== "string") return fail(`${field} is invalid`);
  const date = new Date(value);
  return isNaN(date.getTime()) ? fail(`${field} is not a valid date`) : date;
};

// Parses + validates the payload. Exported so it can be unit-tested without a DB.
export function parseImportPayload(payload: string) {
  let data: any;
  try {
    data = JSON.parse(payload);
  } catch {
    return fail("file is not valid JSON");
  }

  if (data?.version !== EXPORT_VERSION) {
    fail(`unsupported export version (expected ${EXPORT_VERSION})`);
  }

  const categories = asArray(data.categories, "categories").map((c) => ({
    id: reqId(c.id, "category"),
    name: reqName(c.name, "category"),
    icon: typeof c.icon === "string" ? sanitizeString(c.icon, 50) : "",
    createdAt: c.createdAt
      ? reqDate(c.createdAt, "category.createdAt")
      : undefined,
  }));

  const subcategories = asArray(data.subcategories, "subcategories").map(
    (s) => ({
      id: reqId(s.id, "subcategory"),
      categoryId: reqId(s.categoryId, "subcategory.categoryId"),
      name: reqName(s.name, "subcategory"),
      icon: typeof s.icon === "string" ? sanitizeString(s.icon, 50) : "",
      budgetAmount: reqInt(s.budgetAmount, "budgetAmount"),
      rolloverDate: reqDate(s.rolloverDate, "rolloverDate"),
      createdAt: s.createdAt
        ? reqDate(s.createdAt, "subcategory.createdAt")
        : undefined,
    }),
  );

  const expenses = asArray(data.expenses, "expenses").map((e) => ({
    id: reqId(e.id, "expense"),
    subcategoryId: reqId(e.subcategoryId, "expense.subcategoryId"),
    amount: reqInt(e.amount, "amount"),
    description:
      e.description == null ? null : sanitizeString(String(e.description), 255),
    date: reqDate(e.date, "expense.date"),
    createdAt: e.createdAt
      ? reqDate(e.createdAt, "expense.createdAt")
      : undefined,
  }));

  const savingGoals = asArray(data.savingGoals, "savingGoals").map((g) => ({
    id: reqId(g.id, "saving goal"),
    name: reqName(g.name, "saving goal"),
    goalAmount: reqInt(g.goalAmount, "goalAmount"),
    initialSaveAmount: reqInt(g.initialSaveAmount, "initialSaveAmount"),
    goalDate: reqDate(g.goalDate, "goalDate"),
    createdAt: g.createdAt
      ? reqDate(g.createdAt, "savingGoal.createdAt")
      : undefined,
  }));

  const investments = asArray(data.investments, "investments").map((i) => ({
    id: reqId(i.id, "investment"),
    name: reqName(i.name, "investment"),
    amount: reqInt(i.amount, "amount"),
    currency:
      typeof i.currency === "string"
        ? sanitizeString(i.currency, 10).toUpperCase()
        : fail("an investment is missing a currency"),
    quantity:
      typeof i.quantity === "number" && isFinite(i.quantity) && i.quantity >= 0
        ? i.quantity
        : fail("an investment has an invalid quantity"),
    startDate: reqDate(i.startDate, "startDate"),
    initialAmount: reqInt(i.initialAmount, "initialAmount"),
    createdAt: i.createdAt
      ? reqDate(i.createdAt, "investment.createdAt")
      : undefined,
  }));

  // Referential integrity within the file (our exports are always self-contained).
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const s of subcategories) {
    if (!categoryIds.has(s.categoryId)) {
      fail(`subcategory "${s.name}" references a category not in the file`);
    }
  }
  const subcategoryIds = new Set(subcategories.map((s) => s.id));
  for (const e of expenses) {
    if (!subcategoryIds.has(e.subcategoryId)) {
      fail(`an expense references a subcategory not in the file`);
    }
  }

  return { categories, subcategories, expenses, savingGoals, investments };
}

// ---- Persistence ----

// Refuse if any incoming id already exists but belongs to a different user.
async function assertNoForeignIds(
  tx: any,
  userId: string,
  data: ReturnType<typeof parseImportPayload>,
) {
  const checks: Array<Promise<void>> = [];

  const ownByUser = async (
    model: string,
    ids: string[],
    ownerOf: (row: any) => string,
  ) => {
    if (ids.length === 0) return;
    const rows = await tx[model].findMany({
      where: { id: { in: ids } },
      select:
        model === "subcategory"
          ? { id: true, category: { select: { userId: true } } }
          : { id: true, userId: true },
    });
    for (const row of rows) {
      if (ownerOf(row) !== userId) {
        fail("this file conflicts with data that belongs to another account");
      }
    }
  };

  checks.push(
    ownByUser(
      "category",
      data.categories.map((c) => c.id),
      (r) => r.userId,
    ),
  );
  checks.push(
    ownByUser(
      "subcategory",
      data.subcategories.map((s) => s.id),
      (r) => r.category?.userId,
    ),
  );
  checks.push(
    ownByUser(
      "expense",
      data.expenses.map((e) => e.id),
      (r) => r.userId,
    ),
  );
  checks.push(
    ownByUser(
      "savingGoal",
      data.savingGoals.map((g) => g.id),
      (r) => r.userId,
    ),
  );
  checks.push(
    ownByUser(
      "investment",
      data.investments.map((i) => i.id),
      (r) => r.userId,
    ),
  );

  await Promise.all(checks);
}

export async function importUserData(
  prisma: PrismaClient,
  userId: string,
  payload: string,
  mode: ImportMode,
): Promise<ImportResult> {
  const data = parseImportPayload(payload);

  await prisma.$transaction(
    async (tx) => {
      // Never touch another user's records, in either mode.
      await assertNoForeignIds(tx, userId, data);

      // REPLACE: wipe this user's data first, in FK-safe order.
      if (mode === "REPLACE") {
        await tx.expense.deleteMany({ where: { userId } });
        await tx.savingGoal.deleteMany({ where: { userId } });
        await tx.investment.deleteMany({ where: { userId } });
        await tx.subcategory.deleteMany({
          where: { category: { userId } },
        });
        await tx.category.deleteMany({ where: { userId } });
      }

      // Insert/update in dependency order (categories -> subcategories -> expenses).
      for (const c of data.categories) {
        await tx.category.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            name: c.name,
            icon: c.icon,
            ...(c.createdAt ? { createdAt: c.createdAt } : {}),
            user: { connect: { id: userId } },
          },
          update: { name: c.name, icon: c.icon },
        });
      }

      for (const s of data.subcategories) {
        await tx.subcategory.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            name: s.name,
            icon: s.icon,
            budgetAmount: s.budgetAmount,
            rolloverDate: s.rolloverDate,
            ...(s.createdAt ? { createdAt: s.createdAt } : {}),
            category: { connect: { id: s.categoryId } },
          },
          update: {
            name: s.name,
            icon: s.icon,
            budgetAmount: s.budgetAmount,
            rolloverDate: s.rolloverDate,
            categoryId: s.categoryId,
          },
        });
      }

      for (const e of data.expenses) {
        await tx.expense.upsert({
          where: { id: e.id },
          create: {
            id: e.id,
            amount: e.amount,
            description: e.description,
            date: e.date,
            ...(e.createdAt ? { createdAt: e.createdAt } : {}),
            user: { connect: { id: userId } },
            subcategory: { connect: { id: e.subcategoryId } },
          },
          update: {
            amount: e.amount,
            description: e.description,
            date: e.date,
            subcategoryId: e.subcategoryId,
          },
        });
      }

      for (const g of data.savingGoals) {
        await tx.savingGoal.upsert({
          where: { id: g.id },
          create: {
            id: g.id,
            name: g.name,
            goalAmount: g.goalAmount,
            initialSaveAmount: g.initialSaveAmount,
            goalDate: g.goalDate,
            ...(g.createdAt ? { createdAt: g.createdAt } : {}),
            user: { connect: { id: userId } },
          },
          update: {
            name: g.name,
            goalAmount: g.goalAmount,
            initialSaveAmount: g.initialSaveAmount,
            goalDate: g.goalDate,
          },
        });
      }

      for (const i of data.investments) {
        await tx.investment.upsert({
          where: { id: i.id },
          create: {
            id: i.id,
            name: i.name,
            amount: i.amount,
            currency: i.currency,
            quantity: i.quantity,
            startDate: i.startDate,
            initialAmount: i.initialAmount,
            ...(i.createdAt ? { createdAt: i.createdAt } : {}),
            user: { connect: { id: userId } },
          },
          update: {
            name: i.name,
            amount: i.amount,
            currency: i.currency,
            quantity: i.quantity,
            startDate: i.startDate,
            initialAmount: i.initialAmount,
          },
        });
      }
    },
    { timeout: 20000 },
  );

  return {
    categories: data.categories.length,
    subcategories: data.subcategories.length,
    expenses: data.expenses.length,
    savingGoals: data.savingGoals.length,
    investments: data.investments.length,
  };
}
