export const expenseTypeDefs = `
  type Expense {
    id: ID!
    subcategoryId: ID!
    date: String!
    amount: Int!
    description: String
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

  extend type Query {
    expenses(filter: ExpenseFilterInput): [Expense!]!
    chartExpenses(filter: ExpenseFilterInput): ChartExpensesPayload!
  }

  extend type Mutation {
    createExpense(subcategoryId: ID!, amount: Int!, description: String, date: String!): Expense!
    updateExpense(
      id: ID!
      subcategoryId: ID!
      amount: Int!
      description: String
      date: String!
    ): Expense!
    deleteExpense(id: ID!): Expense!
  }
`;
