export const getFilterDateRange = (filterDate) => {
  const filterDateYear = new Date(filterDate).getFullYear();
  const filterDateMonth = new Date(filterDate).getMonth();
  const dateGreaterThanOrEqual = new Date(filterDateYear, filterDateMonth, 1);
  const dateLessThan = new Date(filterDateYear, filterDateMonth + 1, 1);

  return {
    gte: dateGreaterThanOrEqual,
    lt: dateLessThan,
  };
};

export const ensureAuthenticated = (currentUser) => {
  if (currentUser === null) {
    throw new Error("Unauthenticated!");
  }
  if (!currentUser.emailConfirmed) {
    throw new Error("Please confirm your email before continuing");
  }
};

export const notFoundError = (resource) => {
  throw new Error(`No such ${resource} found`);
};
