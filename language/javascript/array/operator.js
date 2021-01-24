const arr = [1, 2, 3]

console.log(arr.map(item => item + 1));
console.log(arr.filter(item => item >= 2));
console.log(arr.reduce((acc, item) => acc + item, 0)); // 0부터 시작해서 누적