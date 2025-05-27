export const userTypeDefs = `
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

  type PasswordResetRequestPayload {
    email: String!
  }

  input ExpenseFilterInput {
    date: String!
  }

  extend type Query {
    users: [User!]!
    user(id: ID!): User!
    me: User!
  }

  extend type Mutation {
    signup(email: String!, password: String!): AuthPayload
    login(email: String!, password: String!): AuthPayload
    resetPasswordRequest(email: String!): PasswordResetRequestPayload!
    resetPassword(token: String!, password: String!): User!
    updateUser(id: ID!, currency: String!): User!
    # Deletes the currently-authenticated user and all their data.
    deleteAccount: Boolean!
  }
`;
