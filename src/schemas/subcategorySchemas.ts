export const subcategoryTypeDefs = `
  type Subcategory {
    id: ID!
    categoryId: ID!
    createdAt: String!
    rolloverDate: String!
    name: String!
    icon: String
    budgetAmount: Int
    expenses(filter: ExpenseFilterInput): [Expense]
  }

  extend type Query {
    subcategory(id: ID!): Subcategory!
    subcategories: [Subcategory!]!
  }

  extend type Mutation {
    createSubcategory(
      categoryId: ID!
      name: String!
      budgetAmount: Int!
      icon: String
      rolloverDate: String
    ): Subcategory!
    updateSubcategory(
      id: ID!
      categoryId: ID!
      name: String!
      budgetAmount: Int!
      rolloverDate: String
    ): Subcategory!
    deleteSubcategory(id: ID!): Subcategory!
  }
`;
