export const notFoundError = (resource: string) => {
  throw new Error(`No such ${resource} found`);
};
