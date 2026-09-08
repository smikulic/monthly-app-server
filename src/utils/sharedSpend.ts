// Shared between the monthly insights split and the yearly chart. Both answer
// "who paid what in shared categories", over different buckets.

export interface NamedUser {
  userId: string;
  user?: { name?: string | null; email?: string | null } | null;
}

export interface Spender {
  userId: string;
  name: string;
  spent: number;
}

/**
 * Display names for everyone who could appear in a comparison: current group
 * members, plus anyone who paid and has since left. Their expenses outlive
 * their membership, and dropping them would stop the totals adding up.
 */
export function buildDisplayNames(
  members: NamedUser[],
  payers: NamedUser[] = [],
): Map<string, string> {
  const names = new Map<string, string>();

  for (const m of members) {
    names.set(m.userId, m.user?.name || m.user?.email || "Unknown");
  }

  for (const p of payers) {
    if (names.has(p.userId)) continue;
    names.set(p.userId, p.user?.name || p.user?.email || "Former member");
  }

  return names;
}

/** Biggest spender first; ties broken by name so the order is stable. */
export function toSpenders(
  totals: Map<string, number>,
  names: Map<string, string>,
): Spender[] {
  return [...totals.entries()]
    .map(([userId, spent]) => ({
      userId,
      name: names.get(userId) || "Unknown",
      spent,
    }))
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
}
