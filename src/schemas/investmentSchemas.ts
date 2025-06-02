export const investmentTypeDefs = `
type Investment {
  id: ID!
  name: String!
  quantity: Float!
  amount: Int!
  currency: String!
  createdAt: String!
  updatedAt: String!
}

input CreateInvestmentInput {
  name: String!
  quantity: Float!
  amount: Int
  currency: String!
}

input UpdateInvestmentInput {
  id: ID!
  name: String
  quantity: Float
  amount: Int
  currency: String
}

extend type Query {
  investments: [Investment!]!
  investment(id: ID!): Investment
}

extend type Mutation {
  createInvestment(input: CreateInvestmentInput!): Investment!
  updateInvestment(input: UpdateInvestmentInput!): Investment!
  deleteInvestment(id: ID!): Boolean!
}
`;
