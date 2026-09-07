import DataLoader from "dataloader";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Total spent per subcategory up to the end of a month.
 *
 * Keyed by `subcategoryId|monthEndISO` so one page of rows, all asking about the
 * same month, collapses into a single query. The rollover figure needs this for
 * every subcategory on screen; without batching it would be a query per row, and
 * the client used to avoid that only by downloading every expense it had.
 */
export function createSubcategorySpendLoader(prisma: PrismaClient) {
  return new DataLoader<string, number>(async (keys) => {
    const parsed = keys.map((key) => {
      const [subcategoryId, monthEnd] = (key as string).split("|");
      return { subcategoryId, monthEnd: new Date(monthEnd) };
    });

    // One query per distinct month, which in practice is one per request.
    const byMonth = new Map<string, string[]>();
    for (const { subcategoryId, monthEnd } of parsed) {
      const bucket = monthEnd.toISOString();
      byMonth.set(bucket, [...(byMonth.get(bucket) ?? []), subcategoryId]);
    }

    const totals = new Map<string, number>();

    await Promise.all(
      [...byMonth].map(async ([monthEnd, subcategoryIds]) => {
        const grouped = await prisma.expense.groupBy({
          by: ["subcategoryId"],
          where: {
            subcategoryId: { in: subcategoryIds },
            date: { lt: new Date(monthEnd) },
          },
          _sum: { amount: true },
        });

        for (const row of grouped) {
          totals.set(`${row.subcategoryId}|${monthEnd}`, row._sum.amount ?? 0);
        }
      }),
    );

    return keys.map((key) => {
      const [subcategoryId, monthEnd] = (key as string).split("|");
      const bucket = new Date(monthEnd).toISOString();
      return totals.get(`${subcategoryId}|${bucket}`) ?? 0;
    });
  });
}
