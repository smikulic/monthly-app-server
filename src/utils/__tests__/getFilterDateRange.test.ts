import { getFilterDateRange } from "../getFilterDateRange";

describe("getFilterDateRange", () => {
  it("returns the first day of the same month and the first day of the next month", () => {
    // June 15, 2025 → gte: June 1, 2025; lt: July 1, 2025
    const { gte, lt } = getFilterDateRange("2025-06-15");

    expect(gte).toEqual(new Date(2025, 5, 1));
    expect(lt).toEqual(new Date(2025, 6, 1));
  });

  it("handles month boundaries correctly (December → January)", () => {
    // December 10, 2020 → gte: December 1, 2020; lt: January 1, 2021
    const { gte, lt } = getFilterDateRange("2020-12-10");

    expect(gte).toEqual(new Date(2020, 11, 1));
    expect(lt).toEqual(new Date(2021, 0, 1));
  });

  it("works when the input date is already on the first of the month", () => {
    // February 1, 2023 → gte: February 1, 2023; lt: March 1, 2023
    const { gte, lt } = getFilterDateRange("2023-02-01");

    expect(gte).toEqual(new Date(2023, 1, 1));
    expect(lt).toEqual(new Date(2023, 2, 1));
  });

  it("handles single-digit months and days", () => {
    // April 5, 2022 → gte: April 1, 2022; lt: May 1, 2022
    const { gte, lt } = getFilterDateRange("2022-04-05");

    expect(gte).toEqual(new Date(2022, 3, 1));
    expect(lt).toEqual(new Date(2022, 4, 1));
  });
});
