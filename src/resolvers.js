const { students } = require("./database.js");

const resolvers = {
  Student: {
    id: (parent, args, context, info) => parent.id,
    email: (parent) => parent.email,
    fullName: (parent) => parent.fullName,
    dept: (parent) => parent.dept,
    enrolled: (parent) => parent.enrolled,
  },

  Query: {
    enrollment: (parent, args) => {
      return students.filter((student) => student.enrolled);
    },
    student: (parent, args) => {
      return students.find((student) => student.id === Number(args.id));
    },
  },

  Mutation: {
    registerStudent: (parent, args) => {
      students.push({
        id: students.length + 1,
        email: args.email,
        fullName: args.fullName,
        dept: args.dept,
        enrolled: false,
      });
      return students[students.length - 1];
    },
    enroll: (parent, args) => {
      const studentToEnroll = students.find(
        (student) => student.id === Number(args.id)
      );
      studentToEnroll.enrolled = true;
      return studentToEnroll;
    },
  },
};

module.exports = {
  resolvers,
};
