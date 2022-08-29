const { gql } = require("apollo-server");

const typeDefs = gql`
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
  }

  type Query {
    categories: [Category!]!
    category(id: ID!): Category!
    users: [User!]!
    user(id: ID!): User!
  }

  type Mutation {
    createUser(email: String!, password: String!): User!
    signup(email: String!, password: String!): AuthPayload
    login(email: String!, password: String!): AuthPayload
  }
`;
module.exports = {
  typeDefs,
};
