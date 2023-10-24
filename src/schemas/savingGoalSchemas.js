import { gql } from "apollo-server";

export const savingGoalTypeDefs = gql`
  type SavingGoal {
    id: ID!
    createdAt: String!
    name: String!
    goalDate: String!
    goalAmount: Int!
    initialSaveAmount: Int
    user: User
  }

  extend type Query {
    savingGoals: [SavingGoal!]!
  }

  extend type Mutation {
    createSavingGoal(
      name: String!
      goalDate: String!
      goalAmount: Int!
      initialSaveAmount: Int
    ): SavingGoal!
    updateSavingGoal(
      id: ID!
      name: String!
      goalDate: String!
      goalAmount: Int!
      initialSaveAmount: Int
    ): SavingGoal!
    deleteSavingGoal(id: ID!): SavingGoal!
  }
`;
