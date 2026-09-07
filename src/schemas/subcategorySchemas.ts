export const subcategoryTypeDefs = `
  type SubcategoryBudget {
    id: ID!
    amount: Int!
    validFrom: String!
  }

  type Subcategory {
    id: ID!
    categoryId: ID!
    createdAt: String!
    name: String!
    icon: String
    "The month the schedule opens. Mirrors the earliest budget period."
    rolloverDate: String!
    "The amount in force today. For any other month use budgetForMonth."
    budgetAmount: Int
    "The amount schedule, oldest first."
    budgets: [SubcategoryBudget!]!
    "The amount that applied in the given month, 0 before the schedule opens."
    budgetForMonth(date: String!): Int!
    "Everything accrued up to the end of that month, minus everything spent."
    rolloverRemaining(date: String!): Int!
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
      "Month the opening budget period starts from."
      validFrom: String!
    ): Subcategory!
    "Renames or re-files. Amounts live on the schedule."
    updateSubcategory(id: ID!, categoryId: ID!, name: String!): Subcategory!
    """
    Adds or replaces the amount effective from validFrom, leaving every earlier
    month on the amount it already had.
    """
    setSubcategoryBudget(
      subcategoryId: ID!
      amount: Int!
      validFrom: String!
    ): Subcategory!
    "Removes the period starting in that month. The last remaining one cannot go."
    deleteSubcategoryBudget(subcategoryId: ID!, validFrom: String!): Subcategory!
    deleteSubcategory(id: ID!): Subcategory!
  }
`;
