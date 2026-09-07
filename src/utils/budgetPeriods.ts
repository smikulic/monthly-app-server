// Budgets are monthly, so every period boundary is the first of a month in UTC.
// A day component would only leave the accrual ambiguous about which month an
// amount first applies to.

/** Normalises a stored date down to the first of its month, UTC. */
export function toMonthStartUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** `YYYY-MM-DD`, `MM-DD-YYYY` or anything Date parses, down to its month. */
export function parseMonthStartUTC(value: string): Date {
  const iso = /^(\d{4})-(\d{2})/.exec(value);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, 1));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), 1));
}

const monthsBetween = (from: Date, to: Date): number =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth());

export interface BudgetPeriod {
  amount: number;
  validFrom: Date;
}

/** Periods must be sorted by `validFrom` ascending. */
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

/**
 * Everything the budget has accrued from the schedule's start through the end of
 * the viewed month.
 *
 * Summed per period rather than multiplied by one amount: a subcategory that
 * went from 100 to 700 accrued 100 a month for the months it was 100, and
 * multiplying the whole span by today's figure re-costs years of history.
 * Months before the schedule opens accrue nothing.
 */
export function accruedBudget(periods: BudgetPeriod[], month: Date): number {
  const view = toMonthStartUTC(month);
  let total = 0;

  for (let i = 0; i < periods.length; i++) {
    const start = toMonthStartUTC(periods[i].validFrom);
    if (start > view) break;

    // A period runs until the next one opens, or to the end of the viewed month
    // when it is the last one still in force.
    const next = periods[i + 1]
      ? toMonthStartUTC(periods[i + 1].validFrom)
      : null;
    const end =
      next && next <= view
        ? next
        : new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + 1, 1));

    total += monthsBetween(start, end) * periods[i].amount;
  }

  return total;
}
