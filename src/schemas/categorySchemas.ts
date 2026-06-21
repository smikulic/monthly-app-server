export const categoryTypeDefs = `
  enum ScopeMode {
    ALL
    MINE
    GROUP
  }

  type Category {
    id: ID!
    name: String!
    icon: String
    subcategories: [Subcategory]
    user: User
    groupId: ID
  }

  extend type Query {
    category(id: ID!): Category!
    categories(scope: ScopeMode, groupId: ID): [Category!]!
  }

  extend type Mutation {
    createCategory(name: String!, icon: String, groupId: ID): Category!
    updateCategory(id: ID!, name: String!, icon: String): Category!
    deleteCategory(id: ID!): Category!
    shareCategory(categoryId: ID!, groupId: ID!): Category!
    unshareCategory(categoryId: ID!): Category!
  }
`;
