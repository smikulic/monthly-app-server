// jest.config.js
export default {
  testEnvironment: "node",

  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // The build targets Node ESM (nodenext); Jest's runtime is CJS.
        // Pin the test compile to CJS so the two stop fighting.
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
        },
      },
    ],
  },

  // Only rewrite imports that point into "../utils/*.js", "../resolvers/*.js", or "../helpers/*.js"
  moduleNameMapper: {
    // rewrite ESM ".js" specifiers back to their ".ts" sources
    "^(\\.{1,2}/(?:config|utils|resolvers|helpers)/.*)\\.js$": "$1.ts",
    // generated Prisma enums, at any relative depth
    "^(?:\\.{1,2}/)+generated/prisma/enums\\.js$":
      "<rootDir>/src/generated/prisma/enums.ts",
  },

  moduleFileExtensions: ["ts", "js", "json", "node"],
  testMatch: ["**/?(*.)+(test).ts"],
};
