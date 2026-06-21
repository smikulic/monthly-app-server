import { randomUUID } from "crypto";
import { GroupRole, InviteStatus } from "@prisma/client";
import { secured } from "../utils/secured.js";
import type { AuthContext } from "../utils/secured.js";
import { sendGroupInviteEmail } from "../helpers/emails.js";
import { sanitizeString, validateEmail } from "../utils/validation.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Throws unless the caller is a member of the group with one of the allowed roles.
async function requireGroupRole(
  context: AuthContext,
  groupId: string,
  roles: GroupRole[],
) {
  const membership = await context.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: context.currentUser.id } },
  });
  if (!membership) {
    throw new Error("You are not a member of this group");
  }
  if (!roles.includes(membership.role)) {
    throw new Error("You don't have permission to do this");
  }
  return membership;
}

const ALL_ROLES = [
  GroupRole.OWNER,
  GroupRole.ADMIN,
  GroupRole.MEMBER,
  GroupRole.VIEWER,
];
const MANAGE_ROLES = [GroupRole.OWNER, GroupRole.ADMIN];

export const groupResolvers = {
  Query: {
    myGroups: secured((_parent, _args, context) =>
      context.prisma.group.findMany({
        where: { members: { some: { userId: context.currentUser.id } } },
        orderBy: { createdAt: "asc" },
      }),
    ),
    group: secured(async (_parent, args, context) => {
      await requireGroupRole(context, args.id, ALL_ROLES);
      return context.prisma.group.findUnique({ where: { id: args.id } });
    }),
  },

  Mutation: {
    createGroup: secured(async (_parent, args, context) => {
      if (!args.name || typeof args.name !== "string" || !args.name.trim()) {
        throw new Error("Group name is required");
      }
      return context.prisma.group.create({
        data: {
          name: sanitizeString(args.name, 100),
          members: {
            create: { userId: context.currentUser.id, role: GroupRole.OWNER },
          },
        },
      });
    }),

    updateGroup: secured(async (_parent, args, context) => {
      await requireGroupRole(context, args.id, MANAGE_ROLES);
      if (!args.name || !args.name.trim()) {
        throw new Error("Group name is required");
      }
      return context.prisma.group.update({
        where: { id: args.id },
        data: { name: sanitizeString(args.name, 100) },
      });
    }),

    deleteGroup: secured(async (_parent, args, context) => {
      await requireGroupRole(context, args.id, [GroupRole.OWNER]);
      // Shared categories revert to personal (owned by their original creator).
      await context.prisma.$transaction([
        context.prisma.category.updateMany({
          where: { groupId: args.id },
          data: { groupId: null },
        }),
        context.prisma.groupInvite.deleteMany({ where: { groupId: args.id } }),
        context.prisma.groupMember.deleteMany({ where: { groupId: args.id } }),
        context.prisma.group.delete({ where: { id: args.id } }),
      ]);
      return true;
    }),

    inviteToGroup: secured(async (_parent, args, context) => {
      await requireGroupRole(context, args.groupId, MANAGE_ROLES);

      const emailValidation = validateEmail(args.email);
      if (!emailValidation.isValid) {
        throw new Error(`Invalid email: ${emailValidation.errors.join(", ")}`);
      }
      const email = args.email.trim().toLowerCase();

      if (email === context.currentUser.email.toLowerCase()) {
        throw new Error("You can't invite yourself");
      }

      // Already a member?
      const existingUser = await context.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        const member = await context.prisma.groupMember.findUnique({
          where: {
            groupId_userId: { groupId: args.groupId, userId: existingUser.id },
          },
        });
        if (member) {
          throw new Error("This person is already a member of the group");
        }
      }

      const role: GroupRole = args.role || GroupRole.MEMBER;
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      // Refresh an existing pending invite instead of creating duplicates.
      const existingInvite = await context.prisma.groupInvite.findFirst({
        where: { groupId: args.groupId, email, status: InviteStatus.PENDING },
      });
      const invite = existingInvite
        ? await context.prisma.groupInvite.update({
            where: { id: existingInvite.id },
            data: {
              token,
              role,
              expiresAt,
              invitedByUserId: context.currentUser.id,
            },
          })
        : await context.prisma.groupInvite.create({
            data: {
              groupId: args.groupId,
              email,
              role,
              token,
              expiresAt,
              invitedByUserId: context.currentUser.id,
            },
          });

      const group = await context.prisma.group.findUnique({
        where: { id: args.groupId },
        select: { name: true },
      });
      const inviter = await context.prisma.user.findUnique({
        where: { id: context.currentUser.id },
        select: { name: true, email: true },
      });
      await sendGroupInviteEmail(
        email,
        token,
        group?.name ?? "a budget",
        inviter?.name || inviter?.email || "A Monthly user",
      );

      return invite;
    }),

    acceptGroupInvite: secured(async (_parent, args, context) => {
      const invite = await context.prisma.groupInvite.findUnique({
        where: { token: args.token },
      });
      if (!invite || invite.status !== InviteStatus.PENDING) {
        throw new Error("This invitation is no longer valid");
      }
      if (invite.expiresAt < new Date()) {
        await context.prisma.groupInvite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.EXPIRED },
        });
        throw new Error("This invitation has expired");
      }

      const existing = await context.prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: invite.groupId,
            userId: context.currentUser.id,
          },
        },
      });
      if (!existing) {
        await context.prisma.groupMember.create({
          data: {
            groupId: invite.groupId,
            userId: context.currentUser.id,
            role: invite.role,
          },
        });
      }
      await context.prisma.groupInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED },
      });

      return context.prisma.group.findUnique({ where: { id: invite.groupId } });
    }),

    revokeGroupInvite: secured(async (_parent, args, context) => {
      const invite = await context.prisma.groupInvite.findUnique({
        where: { id: args.inviteId },
      });
      if (!invite) {
        throw new Error("Invite not found");
      }
      await requireGroupRole(context, invite.groupId, MANAGE_ROLES);
      await context.prisma.groupInvite.update({
        where: { id: args.inviteId },
        data: { status: InviteStatus.REVOKED },
      });
      return true;
    }),

    removeGroupMember: secured(async (_parent, args, context) => {
      await requireGroupRole(context, args.groupId, MANAGE_ROLES);

      const target = await context.prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: args.groupId, userId: args.userId },
        },
      });
      if (!target) {
        throw new Error("Member not found");
      }
      if (target.role === GroupRole.OWNER) {
        const ownerCount = await context.prisma.groupMember.count({
          where: { groupId: args.groupId, role: GroupRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new Error(
            "Can't remove the last owner. Transfer ownership or delete the group.",
          );
        }
      }
      await context.prisma.groupMember.delete({
        where: {
          groupId_userId: { groupId: args.groupId, userId: args.userId },
        },
      });
      return true;
    }),

    leaveGroup: secured(async (_parent, args, context) => {
      const me = await context.prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: args.groupId,
            userId: context.currentUser.id,
          },
        },
      });
      if (!me) {
        throw new Error("You are not a member of this group");
      }
      if (me.role === GroupRole.OWNER) {
        const ownerCount = await context.prisma.groupMember.count({
          where: { groupId: args.groupId, role: GroupRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new Error(
            "You are the last owner. Transfer ownership or delete the group instead.",
          );
        }
      }
      await context.prisma.groupMember.delete({
        where: {
          groupId_userId: {
            groupId: args.groupId,
            userId: context.currentUser.id,
          },
        },
      });
      return true;
    }),
  },

  Group: {
    members: secured((parent, _args, context) =>
      context.prisma.groupMember.findMany({
        where: { groupId: parent.id },
        orderBy: { createdAt: "asc" },
      }),
    ),
    invites: secured((parent, _args, context) =>
      context.prisma.groupInvite.findMany({
        where: { groupId: parent.id, status: InviteStatus.PENDING },
        orderBy: { createdAt: "desc" },
      }),
    ),
  },

  GroupMember: {
    user: secured((parent, _args, context) =>
      context.prisma.user.findUnique({ where: { id: parent.userId } }),
    ),
  },
};
