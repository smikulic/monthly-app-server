import {
  accruedBudget,
  amountForMonth,
  parseMonthStartUTC,
  toMonthStartUTC,
} from "../budgetPeriods";

// The case the schedule exists for: groceries at 100 from June 2023, raised to
// 700 from January 2026 when a second person joined the household.
const periods = [
  { amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
  { amount: 700, validFrom: new Date(Date.UTC(2026, 0, 1)) },
];

const month = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex, 1));

describe("toMonthStartUTC", () => {
  it("drops the day and time", () => {
    expect(toMonthStartUTC(new Date(Date.UTC(2026, 0, 17, 13, 45)))).toEqual(
      month(2026, 0),
    );
  });
});

describe("parseMonthStartUTC", () => {
  it("reads an ISO date down to its month", () => {
    expect(parseMonthStartUTC("2026-01-17")).toEqual(month(2026, 0));
  });

  it("accepts a bare month", () => {
    expect(parseMonthStartUTC("2026-01")).toEqual(month(2026, 0));
  });

  it("accepts the MM-DD-YYYY the expenses page sends", () => {
    expect(parseMonthStartUTC("01-17-2026")).toEqual(month(2026, 0));
  });

  it("throws on nonsense rather than yielding an invalid date", () => {
    expect(() => parseMonthStartUTC("not-a-date")).toThrow();
  });
});

describe("amountForMonth", () => {
  it("returns the amount in force part-way through the first era", () => {
    expect(amountForMonth(periods, month(2024, 3))).toBe(100);
  });

  it("switches on the month the next period opens", () => {
    expect(amountForMonth(periods, month(2026, 0))).toBe(700);
  });

  it("still reads the old amount in the month before", () => {
    expect(amountForMonth(periods, month(2025, 11))).toBe(100);
  });

  it("is null before the schedule opens", () => {
    expect(amountForMonth(periods, month(2023, 0))).toBeNull();
  });

  it("is null for an empty schedule", () => {
    expect(amountForMonth([], month(2026, 0))).toBeNull();
  });
});

describe("accruedBudget", () => {
  it("costs each span at the amount that was in force", () => {
    // Jun 2023 to Dec 2025 is 31 months at 100, Jan to Mar 2026 is 3 at 700.
    // Multiplying the whole span by today's 700 would give 23,800.
    expect(accruedBudget(periods, month(2026, 2))).toBe(31 * 100 + 3 * 700);
  });

  it("does not let a later amount rewrite earlier months", () => {
    expect(accruedBudget(periods, month(2025, 11))).toBe(31 * 100);
  });

  it("counts the opening month itself", () => {
    expect(accruedBudget(periods, month(2023, 5))).toBe(100);
  });

  it("accrues nothing before the schedule opens", () => {
    expect(accruedBudget(periods, month(2023, 0))).toBe(0);
  });

  it("returns zero for an empty schedule", () => {
    expect(accruedBudget([], month(2026, 0))).toBe(0);
  });
});
