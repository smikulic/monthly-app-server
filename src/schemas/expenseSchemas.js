export const expenseTypeDefs = `
  scalar JSON

  type Expense {
    id: ID!
    subcategoryId: ID!
    date: String!
    amount: Int!
  }

  type CategoryExpenseTotal {
    categoryName: String!
    subcategoryName: String!
    total: Int!
  }

  type ChartExpensesPayload {
    monthlyTotals: [Int!]!
    categoryExpenseTotals: [CategoryExpenseTotal!]!
  }

  type InsightPayload {
    title: String!
    narrative: String!
    data: JSON!
  }

  type YearInsightsPayload {
    yearly: InsightPayload!
    forecast: InsightPayload!
  }

  extend type Query {
    expenses(filter: ExpenseFilterInput): [Expense!]!
    chartExpenses(filter: ExpenseFilterInput): ChartExpensesPayload!
    yearlyInsight(filter: ExpenseFilterInput!): YearInsightsPayload!
  }

  extend type Mutation {
    createExpense(subcategoryId: ID!, amount: Int!, date: String!): Expense!
    updateExpense(
      id: ID!
      subcategoryId: ID!
      amount: Int!
      date: String!
    ): Expense!
    deleteExpense(id: ID!): Expense!
  }
`;
