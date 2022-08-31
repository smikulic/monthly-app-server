import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { APP_SECRET } from "./auth";

const User = {
  id: (parent, args, context, info) => parent.id,
  email: (parent) => parent.email,
};

const Query = {
  // enrollment: (parent, args) => {
  //   return prisma.student.findMany({
  //     where: { enrolled: true },
  //   });
  // },
  categories: (parent, args, context) => {
    return context.prisma.category.findMany({});
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

  // createCategory: (parent, args) => {
  //   return prisma.category.create({
  //     data: {
  //       name: args.name,
  //       icon: args.icon || "",
  //       userId: "",
  //     },
  //   });
  //   // enroll: (parent, args) => {
  //   //   return prisma.student.update({
  //   //     where: { id: Number(args.id) },
  //   //     data: {
  //   //       enrolled: true,
  //   //     },
  //   //   });
  // },
};

export const resolvers = { User, Query, Mutation };
