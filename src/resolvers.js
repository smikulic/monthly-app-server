const { prisma } = require("./database.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { APP_SECRET } = require("./auth");

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
  categories: (parent, args) => {
    return prisma.category.findMany({});
  },
  users: (parent, args) => {
    return prisma.user.findMany({});
  },
  user: (parent, args) => {
    return prisma.user.findFirst({
      where: { id: args.id },
    });
  },
};

const Mutation = {
  createUser: (parent, args) => {
    return prisma.user.create({
      data: {
        email: args.email,
        password: args.password,
      },
    });
  },
  signup: async (parent, args) => {
    const password = await bcrypt.hash(args.password, 10);

    const user = prisma.user.create({
      data: { ...args, password },
    });
    const token = jwt.sign({ userId: user.id }, APP_SECRET);

    return {
      token,
      user,
    };
  },
  login: async (parent, args) => {
    const user = await prisma.user.findUnique({
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

const resolvers = { User, Query, Mutation };

module.exports = {
  resolvers,
};
