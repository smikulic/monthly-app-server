/**
 * The dataset the first-run demo runs on.
 *
 * Nothing here is ever written into a user's tables. It is stored as one row
 * (`DemoDataset`), fetched on demand, cached in the browser and thrown away
 * when the demo ends.
 *
 * ## Why months are offsets rather than dates
 *
 * Every date is expressed as a `monthOffset` from whatever month the visitor
 * opens the app in, materialised client-side. A dataset with absolute dates
 * would be showing last year's budget by next spring, and a demo that looks
 * abandoned is worse than no demo.
 *
 * ## What the content has to earn
 *
 * The tour claims five things, so the data has to show five things:
 *
 * - **Budgets** — categories with amounts, some comfortable, one overspent.
 * - **Rollover** — a subcategory underspent for months, so the carried figure
 *   is visibly larger than one month's budget.
 * - **Budget history** — an amount that changes mid-year, so the budget line
 *   steps instead of running flat.
 * - **Insights** — twelve months of expenses, so trends and streaks are real.
 * - **Sharing** — a second household member who actually paid for things.
 *
 * Amounts are whole currency units, matching the rest of the app.
 */

/** Twelve months ending with the month being viewed. */
const HISTORY_MONTHS = 12;

export const DEMO_DATASET_KEY = "default";

/**
 * Bump on every content change. The client compares it against its cached copy
 * and refetches on a mismatch, so an edit here reaches people mid-session
 * rather than only on a cleared cache.
 */
export const DEMO_DATASET_VERSION = 1;

const VIEWER_ID = "demo-user-viewer";
const PARTNER_ID = "demo-user-partner";
const GROUP_ID = "demo-group-household";

interface ExpenseSpec {
  subcategoryId: string;
  /** Months back from the viewed month. 0 is the current month. */
  monthOffset: number;
  day: number;
  amount: number;
  description: string;
  paidById: string;
}

/**
 * A recurring line: the same charge every month, optionally varying.
 *
 * `vary` receives the offset (0 = this month, 11 = eleven months ago) so a
 * series can drift, spike or stop without needing a row written per month.
 */
function recur(
  subcategoryId: string,
  day: number,
  description: string,
  base: number,
  options: {
    paidById?: string;
    /** Return null to skip that month entirely. */
    vary?: (monthsAgo: number) => number | null;
    /** Alternate payers, for the shared-spend story. */
    alternatePayer?: boolean;
    from?: number;
  } = {},
): ExpenseSpec[] {
  const out: ExpenseSpec[] = [];
  const oldest = options.from ?? HISTORY_MONTHS - 1;

  for (let monthsAgo = oldest; monthsAgo >= 0; monthsAgo--) {
    const amount = options.vary ? options.vary(monthsAgo) : base;
    if (amount === null || amount <= 0) continue;

    out.push({
      subcategoryId,
      monthOffset: -monthsAgo,
      day,
      amount,
      description,
      paidById: options.alternatePayer
        ? monthsAgo % 2 === 0
          ? VIEWER_ID
          : PARTNER_ID
        : (options.paidById ?? VIEWER_ID),
    });
  }

  return out;
}

/** Deterministic wobble, so the charts have texture without being random. */
const wobble = (base: number, monthsAgo: number, spread: number) =>
  base + (((monthsAgo * 7) % (spread * 2 + 1)) - spread);

export function buildDemoDataset() {
  const categories = [
    {
      id: "demo-cat-home",
      name: "Home",
      // Shared: this is what the sharing half of the tour points at.
      groupId: GROUP_ID,
      subcategories: [
        {
          id: "demo-sub-rent",
          name: "Rent",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 900 }],
        },
        {
          id: "demo-sub-utilities",
          name: "Utilities",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 140 }],
        },
      ],
    },
    {
      id: "demo-cat-food",
      name: "Food",
      groupId: GROUP_ID,
      subcategories: [
        {
          id: "demo-sub-groceries",
          name: "Groceries",
          // The budget-history story: the weekly shop got bigger when the
          // household did, and the old months stay costed at the old figure.
          budgets: [
            { monthOffset: -(HISTORY_MONTHS - 1), amount: 380 },
            { monthOffset: -5, amount: 450 },
          ],
        },
        {
          id: "demo-sub-eating-out",
          name: "Eating out",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 150 }],
        },
      ],
    },
    {
      id: "demo-cat-transport",
      name: "Transport",
      groupId: null,
      subcategories: [
        {
          id: "demo-sub-fuel",
          name: "Fuel",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 120 }],
        },
        {
          id: "demo-sub-transit",
          name: "Public transport",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 40 }],
        },
      ],
    },
    {
      id: "demo-cat-fun",
      name: "Fun",
      groupId: GROUP_ID,
      subcategories: [
        {
          id: "demo-sub-subscriptions",
          name: "Subscriptions",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 35 }],
        },
        {
          id: "demo-sub-going-out",
          name: "Going out",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 100 }],
        },
      ],
    },
    {
      id: "demo-cat-health",
      name: "Health",
      groupId: null,
      subcategories: [
        {
          // The rollover story: budgeted every month, rarely spent, so the
          // carried figure dwarfs a single month's amount.
          id: "demo-sub-pharmacy",
          name: "Pharmacy",
          budgets: [{ monthOffset: -(HISTORY_MONTHS - 1), amount: 45 }],
        },
      ],
    },
  ];

  const expenses: ExpenseSpec[] = [
    ...recur("demo-sub-rent", 1, "Rent", 900, { alternatePayer: true }),
    ...recur("demo-sub-utilities", 12, "Electricity and water", 0, {
      // Winter costs more. Offsets are months ago, so this is a shape, not a
      // calendar, which is the point of a demo that never goes stale.
      vary: (monthsAgo) => wobble(132, monthsAgo, 18),
      alternatePayer: true,
    }),

    ...recur("demo-sub-groceries", 4, "Weekly shop", 0, {
      vary: (monthsAgo) => wobble(105, monthsAgo, 12),
      paidById: VIEWER_ID,
    }),
    ...recur("demo-sub-groceries", 11, "Weekly shop", 0, {
      vary: (monthsAgo) => wobble(98, monthsAgo, 14),
      paidById: PARTNER_ID,
    }),
    ...recur("demo-sub-groceries", 18, "Weekly shop", 0, {
      vary: (monthsAgo) => wobble(112, monthsAgo, 10),
      paidById: PARTNER_ID,
    }),
    ...recur("demo-sub-groceries", 25, "Weekly shop", 0, {
      vary: (monthsAgo) => wobble(101, monthsAgo, 13),
      paidById: VIEWER_ID,
    }),

    ...recur("demo-sub-eating-out", 8, "Lunch out", 0, {
      vary: (monthsAgo) => wobble(62, monthsAgo, 9),
      alternatePayer: true,
    }),
    ...recur("demo-sub-eating-out", 21, "Dinner", 0, {
      // This month runs over: the one category the tour can point at and say
      // "this is what over budget looks like".
      vary: (monthsAgo) => (monthsAgo === 0 ? 154 : wobble(74, monthsAgo, 11)),
      alternatePayer: true,
    }),

    ...recur("demo-sub-fuel", 6, "Fuel", 0, {
      vary: (monthsAgo) => wobble(108, monthsAgo, 16),
    }),
    ...recur("demo-sub-transit", 2, "Monthly pass", 37),

    ...recur("demo-sub-subscriptions", 3, "Streaming", 18),
    ...recur("demo-sub-subscriptions", 9, "Music", 11),
    ...recur("demo-sub-going-out", 15, "Cinema and drinks", 0, {
      vary: (monthsAgo) => (monthsAgo % 3 === 0 ? null : wobble(68, monthsAgo, 14)),
      alternatePayer: true,
    }),

    // Underspent nearly every month, which is what makes the rollover figure
    // worth looking at.
    ...recur("demo-sub-pharmacy", 14, "Prescription", 0, {
      vary: (monthsAgo) => (monthsAgo % 4 === 0 ? 24 : null),
    }),
  ];

  return {
    schemaVersion: DEMO_DATASET_VERSION,
    currency: "EUR",
    viewerId: VIEWER_ID,
    users: [
      { id: VIEWER_ID, name: "You", email: "you@example.com" },
      { id: PARTNER_ID, name: "Ana", email: "ana@example.com" },
    ],
    groups: [
      {
        id: GROUP_ID,
        name: "Household",
        members: [
          { id: "demo-member-viewer", userId: VIEWER_ID, role: "OWNER" },
          { id: "demo-member-partner", userId: PARTNER_ID, role: "MEMBER" },
        ],
        invites: [],
      },
    ],
    categories,
    expenses,
    savingGoals: [
      {
        id: "demo-goal-holiday",
        name: "Summer holiday",
        goalAmount: 2400,
        initialSaveAmount: 1650,
        goalMonthOffset: 6,
      },
      {
        id: "demo-goal-buffer",
        name: "Emergency buffer",
        goalAmount: 6000,
        initialSaveAmount: 6000,
        goalMonthOffset: 2,
      },
    ],
    investments: [],
  };
}

export type DemoDataset = ReturnType<typeof buildDemoDataset>;
