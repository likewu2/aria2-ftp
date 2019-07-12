// return a Promise
export const sleep = (microsecond) => {
  return new Promise((resolve, reject) => {
  	setInterval(() => resolve(), microsecond);
  });
};
