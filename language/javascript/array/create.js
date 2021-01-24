const arr = [1, 2, 3];
const arr2 = new Array(1, 2, 3);

console.log(typeof arr === "object")
console.log(typeof arr2 === "object")

console.log(arr);
console.log(Object.values(arr));