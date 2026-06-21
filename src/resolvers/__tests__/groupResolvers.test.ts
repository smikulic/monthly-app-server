// src/resolvers/__tests__/groupResolvers.test.ts

import { GroupRole, InviteStatus } from "@prisma/client";

// Mock the email helper so importing groupResolvers doesn't construct the
// Postmark client (which needs a token and isn't relevant to these tests).
jest.mock("../../helpers/emails", () => ({
  sendGroupInviteEmail: jest.fn(),
}));

import { groupResolvers } from "../groupResolvers";

describe("groupResolvers", () => {
  const dummyUser = {
    id: "user-123",
    email: "test@example.com",
    emailConfirmed: true,
  };
  const dummyInfo = {} as any;

  let prismaMock: any;
  let context: any;

  beforeEach(() => {
    prismaMock = {
      group: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      groupMember: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      groupInvite: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    context = { currentUser: dummyUser, prisma: prismaMock, groups: [] };
  });

  describe("Mutation.createGroup", () => {
    it("creates a group with the caller as OWNER", async () => {
      prismaMock.group.create.mockResolvedValue({ id: "g1", name: "Family" });

      await groupResolvers.Mutation.createGroup(
        null,
        { name: "Family" },
        context,
        dummyInfo,
      );

      expect(prismaMock.group.create).toHaveBeenCalledWith({
        data: {
          name: "Family",
          members: { create: { userId: dummyUser.id, role: GroupRole.OWNER } },
        },
      });
    });

    it("rejects an empty name", async () => {
      await expect(
        groupResolvers.Mutation.createGroup(
          null,
          { name: "" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("Group name is required");
    });
  });

  describe("Query.group", () => {
    it("rejects a non-member", async () => {
      prismaMock.groupMember.findUnique.mockResolvedValue(null);

      await expect(
        groupResolvers.Query.group(null, { id: "g1" }, context, dummyInfo),
      ).rejects.toThrow("You are not a member of this group");
    });

    it("returns the group for a member", async () => {
      prismaMock.groupMember.findUnique.mockResolvedValue({
        role: GroupRole.MEMBER,
      });
      prismaMock.group.findUnique.mockResolvedValue({ id: "g1" });

      const result = await groupResolvers.Query.group(
        null,
        { id: "g1" },
        context,
        dummyInfo,
      );
      expect(result).toEqual({ id: "g1" });
    });
  });

  describe("Mutation.inviteToGroup", () => {
    it("rejects inviting yourself", async () => {
      prismaMock.groupMember.findUnique.mockResolvedValue({
        role: GroupRole.OWNER,
      });

      await expect(
        groupResolvers.Mutation.inviteToGroup(
          null,
          { groupId: "g1", email: dummyUser.email },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("You can't invite yourself");
    });

    it("rejects inviting an existing member", async () => {
      prismaMock.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupRole.OWNER }) // requireGroupRole (caller)
        .mockResolvedValueOnce({ id: "m" }); // target already a member
      prismaMock.user.findUnique.mockResolvedValue({ id: "target-user" });

      await expect(
        groupResolvers.Mutation.inviteToGroup(
          null,
          { groupId: "g1", email: "partner@example.com" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("already a member");
    });
  });

  describe("Mutation.acceptGroupInvite", () => {
    it("rejects an invalid/used token", async () => {
      prismaMock.groupInvite.findUnique.mockResolvedValue(null);

      await expect(
        groupResolvers.Mutation.acceptGroupInvite(
          null,
          { token: "nope" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("no longer valid");
    });

    it("rejects (and expires) an expired invite", async () => {
      prismaMock.groupInvite.findUnique.mockResolvedValue({
        id: "i1",
        groupId: "g1",
        role: GroupRole.MEMBER,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
      });
      prismaMock.groupInvite.update.mockResolvedValue({});

      await expect(
        groupResolvers.Mutation.acceptGroupInvite(
          null,
          { token: "expired" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("expired");
      expect(prismaMock.groupInvite.update).toHaveBeenCalledWith({
        where: { id: "i1" },
        data: { status: InviteStatus.EXPIRED },
      });
    });
  });

  describe("Mutation.removeGroupMember", () => {
    it("refuses to remove the last owner", async () => {
      prismaMock.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupRole.OWNER }) // caller
        .mockResolvedValueOnce({ role: GroupRole.OWNER }); // target
      prismaMock.groupMember.count.mockResolvedValue(1);

      await expect(
        groupResolvers.Mutation.removeGroupMember(
          null,
          { groupId: "g1", userId: "u2" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("last owner");
      expect(prismaMock.groupMember.delete).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.leaveGroup", () => {
    it("refuses to let the last owner leave", async () => {
      prismaMock.groupMember.findUnique.mockResolvedValue({
        role: GroupRole.OWNER,
      });
      prismaMock.groupMember.count.mockResolvedValue(1);

      await expect(
        groupResolvers.Mutation.leaveGroup(
          null,
          { groupId: "g1" },
          context,
          dummyInfo,
        ),
      ).rejects.toThrow("last owner");
      expect(prismaMock.groupMember.delete).not.toHaveBeenCalled();
    });
  });
});
