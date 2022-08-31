import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { APP_SECRET } from "./auth";

const User = {
  id: (parent, args, context, info) => parent.id,
  email: (parent) => parent.email,
};

const Query = {
  categories: (parent, args, context) => {
    return context.prisma.category.findMany({
      where: { userId: context.currentUser.id },
      include: {
        user: true,
      },
    });
  },
  users: (parent, args, context) => {
    return context.prisma.user.findMany({});
  },
  user: (parent, args, context) => {
    return context.prisma.user.findFirst({
      where: { id: args.id },
    });
  },
  me: (parent, args, context) => {
    if (context.currentUser === undefined) {
      throw new Error("Unauthenticated!");
    }

    return context.currentUser;
  },
  // Category: {
  //   user: async (parent, args, context) => {
  //     console.log({ parent });
  //     if (!parent.userId) {
  //       return null;
  //     }

  //     return context.prisma.category
  //       .findUnique({ where: { id: parent.id } })
  //       .postedBy();
  //   },
  // },
};

const Mutation = {
  signup: async (parent, args, context) => {
    const password = await bcrypt.hash(args.password, 10);

    const user = context.prisma.user.create({
      data: { ...args, password },
    });

    const token = jwt.sign({ userId: user.id }, APP_SECRET);

    return {
      token,
      user,
    };
  },
  login: async (parent, args, context) => {
    const user = await context.prisma.user.findUnique({
      where: { email: args.email },
    });
    if (!user) {
      throw new Error("No such user found");
    }

    const valid = await bcrypt.compare(args.password, user.password);
    if (!valid) {
      throw new Error("Invalid password");
    }

    const token = jwt.sign({ userId: user.id }, APP_SECRET);

    return {
      token,
      user,
    };
  },
  createCategory: async (parent, args, context) => {
    if (context.currentUser === null) {
      throw new Error("Unauthenticated!");
    }
    return await context.prisma.category.create({
      data: {
        name: args.name,
        icon: args.icon || "",
        user: { connect: { id: context.currentUser.id } },
      },
    });
  },
  //   // enroll: (parent, args) => {
  //   //   return prisma.student.update({
  //   //     where: { id: Number(args.id) },
  //   //     data: {
  //   //       enrolled: true,
  //   //     },
  //   //   });
};

export const resolvers = { User, Query, Mutation };
