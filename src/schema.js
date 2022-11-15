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
    date: String!
    amount: Int!
  }

  type Subcategory {
    id: ID!
    name: String!
    icon: String
    budgetAmount: Int
    expenses: [Expense]
  }

  type Category {
    id: ID!
    name: String!
    icon: String
    subcategories: [Subcategory]
    user: User
  }

  type Query {
    categories: [Category!]!
    category(id: ID!): Category!
    users: [User!]!
    user(id: ID!): User!
    me: User!
  }

  type Mutation {
    signup(email: String!, password: String!): AuthPayload
    login(email: String!, password: String!): AuthPayload
    createCategory(name: String!, icon: String): Category!
    deleteCategory(id: ID!): Category!
  }
`;
