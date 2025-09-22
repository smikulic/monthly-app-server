import DataLoader from "dataloader";
import { PrismaClient, Subcategory } from "@prisma/client";

export function createSubcategoryLoader(prisma: PrismaClient) {
  return new DataLoader<string, Subcategory[]>(async (categoryIds) => {
    // 1 query to get all subcategories for the requested categories
    const subcategories = await prisma.subcategory.findMany({
      where: { categoryId: { in: categoryIds as string[] } },
      orderBy: { createdAt: "asc" },
    });

    // Group them by categoryId
    const subcategoryMap: Record<string, Subcategory[]> = {};
    for (const sub of subcategories) {
      if (!subcategoryMap[sub.categoryId]) {
        subcategoryMap[sub.categoryId] = [];
      }
      subcategoryMap[sub.categoryId].push(sub);
    }

    // Return in the same order as categoryIds
    return categoryIds.map((id) => subcategoryMap[id] ?? []);
  });
}
