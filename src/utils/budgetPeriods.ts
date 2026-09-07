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

const addMonthsUTC = (month: Date, count: number): Date =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + count, 1));

/** Months in the half-open range: `until` is not counted. */
const countMonths = (from: Date, until: Date): number =>
  (until.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (until.getUTCMonth() - from.getUTCMonth());

export interface BudgetPeriod {
  amount: number;
  validFrom: Date;
}

/**
 * The amount in force for a month, or null before the schedule opens.
 *
 * Periods must be sorted by `validFrom` ascending.
 */
export function amountForMonth(
  periods: BudgetPeriod[],
  month: Date,
): number | null {
  const viewedMonth = toMonthStartUTC(month);
  let amountInForce: number | null = null;

  // Each period that has started overwrites the one before it, so whatever
  // survives the walk is the one covering the viewed month.
  for (const period of periods) {
    const periodStarts = toMonthStartUTC(period.validFrom);
    const hasStartedByNow = periodStarts <= viewedMonth;

    if (!hasStartedByNow) break;

    amountInForce = period.amount;
  }

  return amountInForce;
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
  const viewedMonth = toMonthStartUTC(month);
  const monthAfterViewed = addMonthsUTC(viewedMonth, 1);
  let total = 0;

  for (let index = 0; index < periods.length; index++) {
    const period = periods[index];
    const periodStarts = toMonthStartUTC(period.validFrom);
    const hasStartedByNow = periodStarts <= viewedMonth;

    // Sorted ascending, so nothing after this has started either.
    if (!hasStartedByNow) break;

    const nextPeriod = periods[index + 1];
    const nextPeriodStarts = nextPeriod
      ? toMonthStartUTC(nextPeriod.validFrom)
      : null;
    const isSupersededByNow =
      nextPeriodStarts !== null && nextPeriodStarts <= viewedMonth;

    /*
     * Exclusive on purpose. A superseded period stops *before* the month the
     * next one takes over, so that month is counted once, at the new amount. A
     * period still in force stops before the month after the one being viewed,
     * which is how the viewed month itself gets counted.
     */
    const stopsBefore = isSupersededByNow ? nextPeriodStarts : monthAfterViewed;
    const monthsAtThisAmount = countMonths(periodStarts, stopsBefore);

    total += monthsAtThisAmount * period.amount;
  }

  return total;
}
