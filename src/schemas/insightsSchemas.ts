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
  }

  extend type Query {
    insights(date: String!, scope: ScopeMode, groupId: ID): InsightsPayload!
  }
`;
