// jest.config.js
export default {
  preset: "ts-jest",
  testEnvironment: "node",

  // Only rewrite imports that point into "../utils/*.js", "../resolvers/*.js", or "../helpers/*.js"
  moduleNameMapper: {
    "^(\\.{1,2}/(?:config|utils|resolvers|helpers)/.*)\\.js$": "$1.ts",
  },

  moduleFileExtensions: ["ts", "js", "json", "node"],
  testMatch: ["**/?(*.)+(test).ts"],
};
