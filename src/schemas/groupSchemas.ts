export const groupTypeDefs = `
  enum GroupRole {
    OWNER
    ADMIN
    MEMBER
    VIEWER
  }

  enum InviteStatus {
    PENDING
    ACCEPTED
    REVOKED
    EXPIRED
  }

  type Group {
    id: ID!
    name: String!
    createdAt: String!
    members: [GroupMember!]!
    invites: [GroupInvite!]!
  }

  type GroupMember {
    id: ID!
    role: GroupRole!
    user: User!
  }

  type GroupInvite {
    id: ID!
    email: String!
    role: GroupRole!
    status: InviteStatus!
    expiresAt: String!
  }

  extend type Query {
    myGroups: [Group!]!
    group(id: ID!): Group!
  }

  extend type Mutation {
    createGroup(name: String!): Group!
    updateGroup(id: ID!, name: String!): Group!
    deleteGroup(id: ID!): Boolean!
    inviteToGroup(groupId: ID!, email: String!, role: GroupRole): GroupInvite!
    acceptGroupInvite(token: String!): Group!
    revokeGroupInvite(inviteId: ID!): Boolean!
    removeGroupMember(groupId: ID!, userId: ID!): Boolean!
    leaveGroup(groupId: ID!): Boolean!
  }
`;
