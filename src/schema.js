const { gql } = require("apollo-server");

const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    emailConfirmed: Boolean
    currency: String
    categories: [Category]
    expenses: [Expense]
  }

  type Category {
    id: ID!
    name: String!
    icon: String
  }

  type Expense {
    id: ID!
    date: String!
    amount: Int!
  }

  type Query {
    categories: [Category!]!
    category(id: ID!): Category!
    user(id: ID!): User!
  }

  type Mutation {
    createUser(email: String!, password: String!): User!
  }
`;
module.exports = {
  typeDefs,
};
