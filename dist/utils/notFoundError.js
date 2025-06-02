export const notFoundError = (resource) => {
    throw new Error(`No such ${resource} found`);
};
