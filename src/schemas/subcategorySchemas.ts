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
    rolloverDate: String!
    name: String!
    icon: String
    budgetAmount: Int
    "The amount schedule, oldest first. Anything spanning months reads this rather than budgetAmount."
    budgets: [SubcategoryBudget!]!
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
    """
    budgetAmount and rolloverDate are optional because the budget schedule owns
    them. Passing them corrects the amount in place, which is what clients that
    predate setSubcategoryBudget expect; omitting them leaves the schedule alone.
    """
    updateSubcategory(
      id: ID!
      categoryId: ID!
      name: String!
      budgetAmount: Int
      rolloverDate: String
    ): Subcategory!
    """
    Adds or replaces the amount effective from validFrom, leaving every earlier
    month on the amount it already had. This is the "budget is changing" path;
    updateSubcategory stays the "the amount was always wrong" one.
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
