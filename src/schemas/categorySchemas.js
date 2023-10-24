import { gql } from "apollo-server";

export const categoryTypeDefs = gql`
  type Category {
    id: ID!
    name: String!
    icon: String
    subcategories: [Subcategory]
    user: User
  }

  extend type Query {
    category(id: ID!): Category!
    categories: [Category!]!
  }

  extend type Mutation {
    createCategory(name: String!, icon: String): Category!
    updateCategory(id: ID!, name: String!, icon: String): Category!
    deleteCategory(id: ID!): Category!
  }
`;
