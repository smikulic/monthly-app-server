import { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import { WritableStreamBuffer } from "stream-buffers";

// Helper: Generate a PDF budget report and return as base64 string
export async function generateBudgetReportPdf(
  prisma: PrismaClient,
  userId: string,
  year: number
): Promise<string> {
  // --- Data Aggregation ---
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  // 1) Monthly expenses
  const expenses = await prisma.expense.findMany({
    where: { userId, date: { gte: start, lt: end } },
    select: { date: true, amount: true },
  });
  const monthlyExpenses = Array(12).fill(0);
  for (const { date, amount } of expenses) {
    monthlyExpenses[date.getMonth()] += amount;
  }

  // 2) Monthly budget (sum of all subcategory budgets)
  const subscriptionBudgets = await prisma.subcategory.findMany({
    where: { category: { userId } },
    select: { budgetAmount: true },
  });
  const totalMonthlyBudget = subscriptionBudgets.reduce(
    (sum, sub) => sum + sub.budgetAmount,
    0
  );
  const monthlyBudgets = Array(12).fill(totalMonthlyBudget);

  // 3) Category breakdown (sum spent by subcategory + lookup budget)
  type CategoryKey = `${string} / ${string}`; // "CategoryName / SubcategoryName"
  const rawCat = await prisma.expense.groupBy({
    by: ["subcategoryId"],
    where: { userId, date: { gte: start, lt: end } },
    _sum: { amount: true },
  });

  const catMap: Record<CategoryKey, { spent: number; budget: number }> = {};
  for (const { subcategoryId, _sum } of rawCat) {
    const sub = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      select: {
        name: true,
        budgetAmount: true,
        category: { select: { name: true } },
      },
    });

    if (sub && sub.category) {
      const key: CategoryKey =
        `${sub.category.name} / ${sub.name}` as CategoryKey;
      catMap[key] = {
        spent: _sum.amount ?? 0,
        budget: sub.budgetAmount,
      };
    }
  }

  // --- PDF Generation ---
  return new Promise<string>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const stream = new WritableStreamBuffer({
        initialSize: 100 * 1024,
        incrementAmount: 10 * 1024,
      });
      doc.pipe(stream);

      // Header
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.rect(doc.x, doc.y - 8, pageWidth, 30).fill("#277bc0");
      doc
        .fillColor("#ffffff")
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(`MonthlyApp - Budget Report — ${year}`, {
          align: "center",
          lineGap: 6,
        });
      doc.moveDown(2).fillColor("#000000");

      // Overview
      const totalSpent = monthlyExpenses.reduce((sum, v) => sum + v, 0);
      const totalBudget = monthlyBudgets.reduce((sum, v) => sum + v, 0);
      const pctUsed = ((totalSpent / totalBudget) * 100).toFixed(1);

      doc
        .fontSize(12)
        .font("Helvetica")
        .text(`Total Spent:`, 50, doc.y, { continued: true })
        .font("Helvetica-Bold")
        .text(` ${totalSpent}€`, { continued: true })
        .font("Helvetica")
        .text(`   |   Total Budget:`, { continued: true })
        .font("Helvetica-Bold")
        .text(` ${totalBudget}€`, { continued: true })
        .font("Helvetica")
        .text(`   |   Used:`, { continued: true })
        .font("Helvetica-Bold")
        .text(` ${pctUsed}%`);
      doc.moveDown(1.5);

      // Category Breakdown
      const rowHeight = 20;
      doc.fontSize(14).font("Helvetica-Bold").text("Category Breakdown");
      doc.moveDown(0.5).fontSize(10).font("Helvetica");

      let rowIndex = 0;
      for (const [categoryName, { spent, budget }] of Object.entries(catMap)) {
        const y = doc.y;
        if (rowIndex % 2 === 0) {
          doc
            .rect(50, y, pageWidth, rowHeight)
            .fill("#f5f5f5")
            .fillColor("#000");
        }
        doc
          .text(categoryName, 55, y + 5, { width: 200 })
          .text(`${spent}€`, 265, y + 5)
          .text(`${budget}€`, 345, y + 5)
          .text(`${budget - spent}€`, 425, y + 5);
        doc.moveDown(1);
        rowIndex++;
      }
      doc.fillColor("#000");

      // Finalize
      doc.end();
      stream.on("finish", () => {
        const b64 = stream.getContentsAsString("base64");
        if (!b64) return reject(new Error("PDF generation failed"));
        resolve(b64);
      });
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}
