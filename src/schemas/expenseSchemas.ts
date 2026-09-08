export const expenseTypeDefs = `
  type Expense {
    id: ID!
    subcategoryId: ID!
    date: String!
    amount: Int!
    description: String
    paidBy: User
  }

  type CategoryExpenseTotal {
    categoryName: String!
    subcategoryName: String!
    total: Int!
  }

  "One person's shared spend across the year, month by month."
  type SharedUserSeries {
    userId: ID!
    name: String!
    monthlyTotals: [Int!]!
    total: Int!
  }

  type ChartExpensesPayload {
    monthlyTotals: [Int!]!
    "Budget in force in each month of the year, so a mid-year change shows as a step."
    monthlyBudgets: [Int!]!
    "Spend in shared categories only, one series per member. Empty when nothing is shared."
    sharedMonthlyByUser: [SharedUserSeries!]!
    categoryExpenseTotals: [CategoryExpenseTotal!]!
  }

  extend type Query {
    expenses(
      filter: ExpenseFilterInput
      scope: ScopeMode
      groupId: ID
    ): [Expense!]!
    chartExpenses(
      filter: ExpenseFilterInput
      scope: ScopeMode
      groupId: ID
    ): ChartExpensesPayload!
  }

  extend type Mutation {
    createExpense(
      subcategoryId: ID!
      amount: Int!
      description: String
      date: String!
      paidByUserId: ID
    ): Expense!
    updateExpense(
      id: ID!
      subcategoryId: ID!
      amount: Int!
      description: String
      date: String!
      paidByUserId: ID
    ): Expense!
    deleteExpense(id: ID!): Expense!
  }
`;
