import { parseImportPayload } from "../importData";

const validPayload = () => ({
  version: 1,
  exportedAt: "2026-06-21T00:00:00.000Z",
  profile: { id: "u1", email: "a@b.com" },
  categories: [{ id: "c1", name: "Food", icon: "" }],
  subcategories: [
    {
      id: "s1",
      categoryId: "c1",
      name: "Groceries",
      icon: "",
      budgetAmount: 100,
      rolloverDate: "2026-01-01T00:00:00.000Z",
    },
  ],
  expenses: [
    {
      id: "e1",
      subcategoryId: "s1",
      amount: 42,
      description: "Lidl",
      date: "2026-01-03T00:00:00.000Z",
    },
  ],
  savingGoals: [],
  investments: [],
});

describe("parseImportPayload", () => {
  it("parses a valid payload and normalizes dates", () => {
    const result = parseImportPayload(JSON.stringify(validPayload()));

    expect(result.categories).toHaveLength(1);
    expect(result.subcategories[0].rolloverDate).toBeInstanceOf(Date);
    expect(result.expenses[0].amount).toBe(42);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseImportPayload("{not json")).toThrowError(
      /not valid JSON/,
    );
  });

  it("rejects an unsupported export version", () => {
    const bad = { ...validPayload(), version: 2 };
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrowError(
      /unsupported export version/,
    );
  });

  it("rejects when a top-level collection is not a list", () => {
    const bad = { ...validPayload(), expenses: "nope" };
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrowError(
      /"expenses" must be a list/,
    );
  });

  it("rejects a subcategory that references a category not in the file", () => {
    const bad = validPayload();
    bad.subcategories[0].categoryId = "missing";
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrowError(
      /references a category not in the file/,
    );
  });

  it("rejects an expense with an invalid amount", () => {
    const bad = validPayload();
    (bad.expenses[0] as any).amount = -5;
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrowError(
      /Import failed/,
    );
  });
});
