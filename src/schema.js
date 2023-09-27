import { gql } from "apollo-server";

export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    password: String!
    emailConfirmed: Boolean
    currency: String
    categories: [Category]
    expenses: [Expense]
  }

  type AuthPayload {
    token: String
    user: User
  }

  type Expense {
    id: ID!
    subcategoryId: ID!
    date: String!
    amount: Int!
  }

  type Subcategory {
    id: ID!
    createdAt: String!
    name: String!
    icon: String
    budgetAmount: Int
    expenses(filter: ExpenseFilterInput): [Expense]
  }

  type Category {
    id: ID!
    name: String!
    icon: String
    subcategories: [Subcategory]
    user: User
  }

  input ExpenseFilterInput {
    date: String!
  }

  type Query {
    expenses(filter: ExpenseFilterInput): [Expense!]!
    category(id: ID!): Category!
    categories: [Category!]!
    subcategory(id: ID!): Subcategory!
    subcategories: [Subcategory!]!
    users: [User!]!
    user(id: ID!): User!
    me: User!
  }

  type Mutation {
    signup(email: String!, password: String!): AuthPayload
    login(email: String!, password: String!): AuthPayload
    createCategory(name: String!, icon: String): Category!
    deleteCategory(id: ID!): Category!
    createSubcategory(
      categoryId: ID!
      name: String!
      budgetAmount: Int!
      icon: String
    ): Subcategory!
    deleteSubcategory(id: ID!): Subcategory!
    createExpense(subcategoryId: ID!, amount: Int!, date: String!): Expense!
  }
`;
