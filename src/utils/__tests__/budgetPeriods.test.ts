import {
  amountForMonth,
  parseMonthStartUTC,
  toMonthStartUTC,
} from "../budgetPeriods";

describe("toMonthStartUTC", () => {
  it("drops the day and time", () => {
    expect(toMonthStartUTC(new Date(Date.UTC(2026, 0, 17, 13, 45)))).toEqual(
      new Date(Date.UTC(2026, 0, 1)),
    );
  });

  it("leaves a date already on the first alone", () => {
    expect(toMonthStartUTC(new Date(Date.UTC(2026, 0, 1)))).toEqual(
      new Date(Date.UTC(2026, 0, 1)),
    );
  });
});

describe("parseMonthStartUTC", () => {
  it("reads a full date down to its month", () => {
    expect(parseMonthStartUTC("2026-01-17")).toEqual(
      new Date(Date.UTC(2026, 0, 1)),
    );
  });

  it("accepts a bare month", () => {
    expect(parseMonthStartUTC("2026-01")).toEqual(new Date(Date.UTC(2026, 0, 1)));
  });
});

describe("amountForMonth", () => {
  const periods = [
    { amount: 100, validFrom: new Date(Date.UTC(2023, 5, 1)) },
    { amount: 700, validFrom: new Date(Date.UTC(2026, 0, 1)) },
  ];

  it("returns the amount in force part-way through the first era", () => {
    expect(amountForMonth(periods, new Date(Date.UTC(2024, 3, 9)))).toBe(100);
  });

  it("switches on the month the next period opens", () => {
    expect(amountForMonth(periods, new Date(Date.UTC(2026, 0, 1)))).toBe(700);
  });

  it("still reads the old amount in the month before", () => {
    expect(amountForMonth(periods, new Date(Date.UTC(2025, 11, 31)))).toBe(100);
  });

  it("is null before the schedule opens", () => {
    expect(amountForMonth(periods, new Date(Date.UTC(2023, 0, 1)))).toBeNull();
  });

  it("is null for an empty schedule", () => {
    expect(amountForMonth([], new Date())).toBeNull();
  });
});
