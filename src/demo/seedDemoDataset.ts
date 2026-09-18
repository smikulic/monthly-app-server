/**
 * Writes the first-run demo dataset into its single row.
 *
 * Runs at the end of `yarn build`, so every deploy publishes whatever
 * `demoDataset.ts` currently says. The write is an upsert keyed on `key`, so
 * re-running it only refreshes the payload, and it touches no user tables at
 * all.
 *
 * It exits non-zero on failure, which stops the deploy. By this point
 * `prisma migrate deploy` has already proved the database is reachable, so a
 * failure here is a real fault rather than a flaky connection — and a demo
 * that silently stopped updating is the kind of rot nobody notices.
 *
 * Deliberately not part of `seed.ts`, which builds demo *accounts* and is run
 * by hand.
 */
import { prisma } from "../prismaClient.js";
import {
  buildDemoDataset,
  DEMO_DATASET_KEY,
  DEMO_DATASET_VERSION,
} from "./demoDataset.js";

const payload = buildDemoDataset();

// Round-tripped rather than cast: it both satisfies Prisma's `InputJsonValue`
// and proves the payload is actually serialisable, which is the one property a
// column of type Json needs and a cast would not check.
const json = JSON.parse(JSON.stringify(payload));

try {
  const dataset = await prisma.demoDataset.upsert({
    where: { key: DEMO_DATASET_KEY },
    create: {
      key: DEMO_DATASET_KEY,
      version: DEMO_DATASET_VERSION,
      payload: json,
    },
    update: { version: DEMO_DATASET_VERSION, payload: json },
  });

  console.log(
    `[demo-dataset] ${dataset.key} v${dataset.version}: ` +
      `${payload.categories.length} categories, ${payload.expenses.length} expenses`,
  );
} catch (error) {
  console.error("[demo-dataset] seed failed", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
