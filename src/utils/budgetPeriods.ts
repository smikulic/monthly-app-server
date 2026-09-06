// Budgets are monthly, so every period boundary is the first of a month in UTC.
// A day component would only leave the accrual ambiguous about which month an
// amount first applies to, and `rolloverDate` already carries one that has
// never meant anything.

/** Normalises a stored date down to the first of its month, UTC. */
export function toMonthStartUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** `YYYY-MM-DD` or `YYYY-MM` to the first of that month, UTC. */
export function parseMonthStartUTC(value: string): Date {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export interface BudgetPeriod {
  amount: number;
  validFrom: Date;
}

/**
 * The amount in force for `month`, or null when the schedule has not started.
 *
 * Periods must be sorted by `validFrom` ascending.
 */
export function amountForMonth(
  periods: BudgetPeriod[],
  month: Date,
): number | null {
  const target = toMonthStartUTC(month);
  let current: number | null = null;

  for (const period of periods) {
    if (toMonthStartUTC(period.validFrom) > target) break;
    current = period.amount;
  }

  return current;
}
