import { secured } from "../utils/secured.js";
import { categoryScopeWhere } from "../utils/scope.js";

const TOP_N = 5;
const STREAK_LOOKBACK = 6; // months of history considered for an on-budget streak

// Local-time month range, matching getFilterDateRange / chartExpenses bucketing.
function monthRange(year: number, month: number) {
  return {
    gte: new Date(year, month, 1),
    lt: new Date(year, month + 1, 1),
  };
}

const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

export const insightsResolvers = {
  Query: {
    insights: secured(async (_parent: any, args: any, context: any) => {
      const viewed = new Date(args.date);
      const vYear = viewed.getFullYear();
      const vMonth = viewed.getMonth(); // 0-based
      const vIndex = vYear * 12 + vMonth;

      const now = new Date();
      const isCurrentMonth =
        now.getFullYear() === vYear && now.getMonth() === vMonth;
      const isFutureMonth = vIndex > now.getFullYear() * 12 + now.getMonth();
      const daysInMonth = new Date(vYear, vMonth + 1, 0).getDate();
      // How far we are through the month (full month for past months).
      const daysElapsed = isFutureMonth
        ? 0
        : isCurrentMonth
          ? Math.min(now.getDate(), daysInMonth)
          : daysInMonth;

      const catWhere = categoryScopeWhere(args, context);

      // Categories + their subcategory budgets, in the active scope.
      const categories = await context.prisma.category.findMany({
        where: catWhere,
        select: {
          id: true,
          name: true,
          groupId: true,
          subcategories: {
            select: { id: true, name: true, budgetAmount: true },
          },
        },
      });

      // Lookups: subcategory -> its category; category -> budget total.
      const subToCat = new Map<
        string,
        { categoryId: string; categoryName: string; subcategoryName: string }
      >();
      const subBudget = new Map<string, number>();
      const catMeta = new Map<
        string,
        { name: string; groupId: string | null; budget: number }
      >();

      for (const c of categories) {
        let budget = 0;
        for (const s of c.subcategories) {
          subToCat.set(s.id, {
            categoryId: c.id,
            categoryName: c.name,
            subcategoryName: s.name,
          });
          subBudget.set(s.id, s.budgetAmount || 0);
          budget += s.budgetAmount || 0;
        }
        catMeta.set(c.id, { name: c.name, groupId: c.groupId, budget });
      }

      // Current + previous month expenses (scope-bound).
      const [curExpenses, prevExpenses] = await Promise.all([
        context.prisma.expense.findMany({
          where: { subcategory: { category: catWhere }, date: monthRange(vYear, vMonth) },
          select: {
            id: true,
            amount: true,
            date: true,
            description: true,
            subcategoryId: true,
            user: { select: { name: true, email: true } },
          },
        }),
        context.prisma.expense.findMany({
          where: {
            subcategory: { category: catWhere },
            date: monthRange(vYear, vMonth - 1),
          },
          select: { amount: true, subcategoryId: true },
        }),
      ]);

      // Spend per category, this month and last.
      const curByCat = new Map<string, number>();
      const prevByCat = new Map<string, number>();
      let totalSpent = 0;
      let previousMonthTotal = 0;

      for (const e of curExpenses) {
        const ref = subToCat.get(e.subcategoryId);
        if (!ref) continue;
        curByCat.set(ref.categoryId, (curByCat.get(ref.categoryId) || 0) + e.amount);
        totalSpent += e.amount;
      }
      for (const e of prevExpenses) {
        const ref = subToCat.get(e.subcategoryId);
        if (!ref) continue;
        prevByCat.set(ref.categoryId, (prevByCat.get(ref.categoryId) || 0) + e.amount);
        previousMonthTotal += e.amount;
      }

      // Pace / safe-to-spend per category.
      const pace = [...catMeta.entries()].map(([categoryId, meta]) => {
        const spent = curByCat.get(categoryId) || 0;
        const projected =
          daysElapsed > 0
            ? Math.round((spent * daysInMonth) / daysElapsed)
            : spent;
        return {
          categoryId,
          categoryName: meta.name,
          groupId: meta.groupId,
          budget: meta.budget,
          spent,
          projected,
          safeToSpend: meta.budget - spent,
          percentUsed: meta.budget > 0 ? (spent / meta.budget) * 100 : 0,
        };
      });

      const totalBudget = [...catMeta.values()].reduce((a, m) => a + m.budget, 0);
      const totalProjected =
        daysElapsed > 0
          ? Math.round((totalSpent * daysInMonth) / daysElapsed)
          : totalSpent;

      // Biggest movers vs last month.
      const moverIds = new Set<string>([...curByCat.keys(), ...prevByCat.keys()]);
      const biggestMovers = [...moverIds]
        .map((categoryId) => {
          const currentTotal = curByCat.get(categoryId) || 0;
          const previousTotal = prevByCat.get(categoryId) || 0;
          const delta = currentTotal - previousTotal;
          return {
            categoryId,
            categoryName: catMeta.get(categoryId)?.name || "Unknown",
            currentTotal,
            previousTotal,
            delta,
            percentChange:
              previousTotal > 0 ? (delta / previousTotal) * 100 : null,
          };
        })
        .filter((m) => m.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, TOP_N);

      // Top individual expenses this month.
      const topExpenses = [...curExpenses]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, TOP_N)
        .map((e) => {
          const ref = subToCat.get(e.subcategoryId);
          return {
            id: e.id,
            amount: e.amount,
            description: e.description,
            date: e.date.getTime().toString(),
            subcategoryName: ref?.subcategoryName || "Unknown",
            categoryName: ref?.categoryName || "Unknown",
            paidByName: e.user?.name || e.user?.email || null,
          };
        });

      // On-budget streaks: consecutive months (ending this one) at or under
      // budget, per subcategory. Budgets aren't versioned, so the current
      // budget is applied to past months (a known approximation).
      const streakStart = new Date(vYear, vMonth - (STREAK_LOOKBACK - 1), 1);
      const streakExpenses = await context.prisma.expense.findMany({
        where: {
          subcategory: { category: catWhere },
          date: { gte: streakStart, lt: monthRange(vYear, vMonth).lt },
        },
        select: { amount: true, date: true, subcategoryId: true },
      });

      // subcategoryId -> monthIndex -> spent
      const subMonthSpend = new Map<string, Map<number, number>>();
      for (const e of streakExpenses) {
        const idx = monthIndex(e.date);
        let m = subMonthSpend.get(e.subcategoryId);
        if (!m) {
          m = new Map();
          subMonthSpend.set(e.subcategoryId, m);
        }
        m.set(idx, (m.get(idx) || 0) + e.amount);
      }

      const streaks = [...subBudget.entries()]
        .filter(([, budget]) => budget > 0)
        .map(([subcategoryId, budget]) => {
          const months = subMonthSpend.get(subcategoryId);
          let monthsUnderBudget = 0;
          for (let i = 0; i < STREAK_LOOKBACK; i++) {
            const spent = months?.get(vIndex - i) || 0;
            if (spent <= budget) monthsUnderBudget++;
            else break;
          }
          const ref = subToCat.get(subcategoryId);
          return {
            subcategoryId,
            subcategoryName: ref?.subcategoryName || "Unknown",
            categoryName: ref?.categoryName || "Unknown",
            monthsUnderBudget,
          };
        })
        .filter((s) => s.monthsUnderBudget >= 1)
        .sort((a, b) => b.monthsUnderBudget - a.monthsUnderBudget)
        .slice(0, TOP_N);

      return {
        daysElapsed,
        daysInMonth,
        totalBudget,
        totalSpent,
        totalProjected,
        totalSafeToSpend: totalBudget - totalSpent,
        currentMonthTotal: totalSpent,
        previousMonthTotal,
        monthOverMonthDelta: totalSpent - previousMonthTotal,
        monthOverMonthPercent:
          previousMonthTotal > 0
            ? ((totalSpent - previousMonthTotal) / previousMonthTotal) * 100
            : null,
        pace,
        biggestMovers,
        topExpenses,
        streaks,
      };
    }),
  },
};
