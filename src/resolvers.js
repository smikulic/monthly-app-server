const { prisma } = require("./database.js");

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
  // enroll: (parent, args) => {
  //   return prisma.student.update({
  //     where: { id: Number(args.id) },
  //     data: {
  //       enrolled: true,
  //     },
  //   });
  // },
};

const resolvers = { User, Query, Mutation };

module.exports = {
  resolvers,
};
