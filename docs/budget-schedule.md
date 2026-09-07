# Budget schedule

How a subcategory's budget changes over time, and why it works this way.

Living document. Decisions are appended with dates as they are made.

---

## The problem it solves

A subcategory used to hold one budget: `budgetAmount`, plus `rolloverDate`
marking when accrual started. The rollover pot was `monthsSince(rolloverDate) *
budgetAmount`.

That multiplication is the bug. `budgetAmount` was a single mutable column, so
it applied *today's* figure to *every* month since the start. Raising groceries
from 100 to 700 in September 2026, on a schedule opened in June 2023, moved the
reported pot from 4,000 to 28,000. Three years of history silently re-costed.

The two workarounds both fail:

- **Edit the amount.** That is the above.
- **Create a new subcategory.** `Expense.subcategoryId` is a required foreign
  key, so the old spending stays attached to the abandoned row. History is not
  rewritten, it is detached.

Both are forced by the model expressing *one budget for all time* when the
domain is *a sequence of budgets, each valid for a stretch of time*.

## The model

```prisma
model SubcategoryBudget {
  amount        Int
  validFrom     DateTime      // always the 1st of a month
  subcategoryId String
  @@unique([subcategoryId, validFrom])
}
```

Groceries is two rows: `{100, 2023-06-01}` and `{700, 2026-01-01}`.

A period has a start and no end. Its end is implied by the next period's start,
or by the month being asked about. An explicit `validTo` would mean two rows must
agree about one boundary, and eventually they would not.

`@@unique([subcategoryId, validFrom])` makes "set the budget for month M"
idempotent. Setting the same month twice replaces the amount rather than adding a
second period, which is why the UI needs no separate edit mode.

### The flat columns are caches

`Subcategory.budgetAmount` and `Subcategory.rolloverDate` still exist, but the
schedule is the truth. `syncToSchedule` in `subcategoryResolvers.ts` re-derives
both after every write, so neither can drift.

They stayed because `reports.ts`, `insightsResolvers.ts` and
`weeklyReminder.core.ts` only ever ask "what does this cost right now", and
keeping the columns meant none of them needed changing. `rolloverDate` costs 8
bytes a row and keeps a revert of this feature to a code revert.

`rolloverDate` is not exposed for the client to compute with. It is read by the
v1 export only.

## The accrual

`src/utils/budgetPeriods.ts`. Two pure functions, no I/O, tested directly.

`amountForMonth(periods, month)` walks the schedule and returns the last period
that has started, or null before the schedule opens.

`accruedBudget(periods, month)` sums per segment. Each period runs until the next
one opens, or until the end of the viewed month if it is the last in force:

```
viewing March 2026:
  2023-06 → 2025-12   31 months × 100 = 3,100
  2026-01 → 2026-03    3 months × 700 = 2,100
                                       ───────
                                         5,200
```

The old single-amount formula would have said 23,800.

`end` is exclusive, so `monthsBetween` counts `[start, end)`. A period ending
because the next opens excludes that boundary month, which belongs to the next
period; a period still in force ends at `view + 1 month`, which includes the
month being viewed.

Three cases need no special handling: a month before the schedule opens breaks
before any arithmetic and returns 0, an empty schedule never enters the loop,
and a future-dated period breaks the same way so it contributes nothing. The
original client code had no such guard and returned a negative budget for months
before the rollover date.

### Two invariants

**Periods must be sorted by `validFrom` ascending.** The `break` relies on it.
Every call site orders (`subcategoryBudgetLoader`, `syncToSchedule`,
`deleteSubcategoryBudget`), but this is an unenforced precondition: an unsorted
caller gets a wrong number, not an error.

**All month arithmetic is UTC.** `validFrom` is stored as UTC midnight on the
1st. Reading it with local getters at a negative offset yields the *previous*
month, so every figure would shift by a period boundary for users west of UTC.
The client implementation used local getters and had this bug latent.

## Where it runs

Both figures are computed **server-side** and exposed as GraphQL fields on
`Subcategory`:

```graphql
budgetForMonth(date: String!): Int!      # the amount in force that month
rolloverRemaining(date: String!): Int!   # accrued minus spent
```

The client formats them and does no budgeting arithmetic.

`rolloverRemaining` needs total spend per subcategory, which would otherwise be
one query per row. `subcategorySpendLoader.ts` batches it into a single grouped
query per distinct month, keyed `subcategoryId|monthEndISO`. The month is in the
key because the same subcategory can be asked about for two months in one
request, and the answers differ.

`budgetForMonth` and `rolloverRemaining` both call
`subcategoryBudget.load(parent.id)`. That is not a double fetch: DataLoader
memoises per key within a request as well as batching across keys, so the
schedule is read once however many resolvers ask. A page load is therefore a
flat four queries — categories, subcategories, budget periods, expense sums —
regardless of how many subcategories exist.

`Subcategory.expenses` is deliberately *not* batched and would be one query per
row. Nothing requests it: the only query that nested it was dead and was deleted
on 2026-09-07. Batch it before wiring up anything that selects it.

### Cache consequence

The fields take a `date`, so Apollo caches a separate `CategoriesList` entry per
month visited, and `refetchQueries` only refreshes *active* queries. Any write
can move several months at once: rollover is cumulative, so an expense recorded
in March changes April onwards too.

`invalidateBudgetFigures` (client) evicts the whole `categories` root field after
a budget or expense write. Deliberately blunt. Working out which months moved
would mean re-implementing the accrual on the client, which is the thing being
avoided.

## The three verbs

| Mutation | Means | Effect |
|---|---|---|
| `setSubcategoryBudget(id, amount, validFrom)` | the budget is changing | Opens a period. Earlier months keep their amounts. |
| `updateSubcategory(id, categoryId, name)` | rename or re-file | Never touches money. |
| `deleteSubcategoryBudget(id, validFrom)` | that change never happened | Removes a period. Refuses the last one. |

Two invariants worth knowing:

- **`budgetAmount` follows the period in force *today*, not the newest one.**
  Scheduling a raise for next year must not change what this month reports.
- **A subcategory always has at least one period.** Zero periods means no budget
  in any month, which the UI cannot show and offers no way back from.

## Export format

v2 adds a `budgets` array per subcategory. v1 files still import, treated as the
single period they imply. Without this, exporting a two-period subcategory and
re-importing it would assert "700 since 2023", which is the original bug
reintroduced through the back door.

## How to change a budget

Open the subcategory, enter the amount, pick the month it starts, Apply. The
month defaults to the current one, so the ordinary change never reaches back and
re-costs recorded months. Clicking an existing row loads it for correction.

---

# Decision log

## 2026-09-07 — Effective-dated periods over a mutable amount

Both workarounds available in the old model corrupt something: editing in place
rewrites history, a new subcategory detaches it. Changed the model rather than
picking the least-bad workaround.

Backfill shipped inside the same migration as the table, so it is
behaviour-preserving: every existing subcategory got one period carrying the
amount it already had, from the month it already accrued from. Verified 57 of 57
rows, zero mismatches.

## 2026-09-07 — Keep `rolloverDate` rather than drop it

Initially recommended dropping it. Reversed after the complexity that justified
dropping went away for independent reasons.

Kept because: reverting the feature stays a code revert rather than a data
migration, it costs 8 bytes a row, and removing it from the API would break page
loads for the deployed client.

Kept honest by `syncToSchedule` deriving it from the earliest period, so it
cannot drift.

## 2026-09-07 — Accrual on the server, not the client

The client had 135 lines of budgeting rules and fetched every expense ever
recorded to feed them. `amountForMonth` also existed on the server to maintain
`budgetAmount`, so the rule was implemented twice in two languages, and the two
copies had already diverged: only one clamped at the schedule start.

Cost of the move: date-parameterised fields fragment the Apollo cache per month,
needing explicit invalidation. That is ~15 lines in one helper.

Revisited on 2026-09-07 and confirmed. The scaling argument is weak on its own
(210 expenses today), but the duplicated-rule argument holds regardless of size.

If a month-by-month chart is ever needed, add `budgetSeries(from:to:)` returning
a range in one call rather than moving the accrual back.

## 2026-09-07 — Output keeps the old name, inputs take the new one

`Subcategory.rolloverDate` keeps its name: it is an output backed by a stored
column with an export contract, and removing it breaks deployed clients.
`createSubcategory(validFrom:)` uses the new name to match
`setSubcategoryBudget` and the model. Renaming an input can at worst fail a
create for the length of one deploy; removing an output breaks page loads.

## 2026-09-07 — Deleted the dead `Category` query

`GET_CATEGORY` in the client nested `Subcategory.expenses`, which has no loader
and would have been one query per subcategory. Nothing imported it. Deleted
rather than batched: removing the caller is cheaper than optimising a path with
no users, and it makes the N+1 unreachable instead of merely unused.

The server's `Query.category` resolver is untouched.

## 2026-09-07 — No edit mode in the schedule UI

`setSubcategoryBudget` upserts on the month, so changing a period and adding one
are the same call. The editor is a read-only list plus one always-present form;
clicking a row loads it. Removed a draft state machine that existed only to
distinguish two operations that turned out to be one.
