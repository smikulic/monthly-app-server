import { gql } from "apollo-server";

export const expenseTypeDefs = gql`
  type Expense {
    id: ID!
    subcategoryId: ID!
    date: String!
    amount: Int!
  }

  extend type Query {
    expenses(filter: ExpenseFilterInput): [Expense!]!
    chartExpenses(filter: ExpenseFilterInput): [Int!]!
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
