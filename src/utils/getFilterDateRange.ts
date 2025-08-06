export const getFilterDateRange = (filterDate: string) => {
  const filterDateYear = new Date(filterDate).getFullYear();
  const filterDateMonth = new Date(filterDate).getMonth();
  const dateGreaterThanOrEqual = new Date(filterDateYear, filterDateMonth, 1);
  const dateLessThan = new Date(filterDateYear, filterDateMonth + 1, 1);

  console.log({filterDate})
  console.log({dateGreaterThanOrEqual})
  console.log({dateLessThan})

  return {
    gte: dateGreaterThanOrEqual,
    lt: dateLessThan,
  };
};
