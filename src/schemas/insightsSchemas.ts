export const insightsTypeDefs = `
  type CategoryPace {
    categoryId: ID!
    categoryName: String!
    groupId: ID
    budget: Int!
    spent: Int!
    projected: Int!
    safeToSpend: Int!
    percentUsed: Float!
  }

  type CategoryMover {
    categoryId: ID!
    categoryName: String!
    currentTotal: Int!
    previousTotal: Int!
    delta: Int!
    percentChange: Float
  }

  type TopExpense {
    id: ID!
    amount: Int!
    description: String
    date: String!
    subcategoryName: String!
    categoryName: String!
    paidByName: String
  }

  type BudgetStreak {
    subcategoryId: ID!
    subcategoryName: String!
    categoryName: String!
    monthsUnderBudget: Int!
  }

  "One member's spend. Present with 0 when they spent nothing, so a comparison is not ambiguous."
  type SharedSpender {
    userId: ID!
    name: String!
    spent: Int!
  }

  "A shared subcategory, split by who paid."
  type SharedSubcategorySplit {
    subcategoryId: ID!
    subcategoryName: String!
    categoryName: String!
    total: Int!
    perUser: [SharedSpender!]!
  }

  type InsightsPayload {
    daysElapsed: Int!
    daysInMonth: Int!
    totalBudget: Int!
    totalSpent: Int!
    totalProjected: Int!
    totalSafeToSpend: Int!
    currentMonthTotal: Int!
    previousMonthTotal: Int!
    monthOverMonthDelta: Int!
    monthOverMonthPercent: Float
    pace: [CategoryPace!]!
    biggestMovers: [CategoryMover!]!
    topExpenses: [TopExpense!]!
    streaks: [BudgetStreak!]!
    "Spend in shared categories only, per member, across the viewed month."
    sharedTotalsByUser: [SharedSpender!]!
    "The same spend broken down per shared subcategory. Empty when nothing is shared."
    sharedSplits: [SharedSubcategorySplit!]!
  }

  extend type Query {
    insights(date: String!, scope: ScopeMode, groupId: ID): InsightsPayload!
  }
`;
