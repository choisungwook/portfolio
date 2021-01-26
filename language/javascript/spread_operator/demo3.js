const arr1 = [1, 2, 3];
// copy arr1
const arr2 = [...arr1];

console.log(arr2);
console.log('');

arr2.push(4);
console.log(arr1);
console.log(arr2);

// copy object
const obj1 = {name: 'john', age: 10};
const obj2 = {hobby: 'unknown'};
const obj3 = {...obj1, ...obj2};

console.log(obj3);

// copy object(일부분 값 변경)
const obj4 = {x:1, y:2, z:3};
const obj5 = {...obj4, x:4};
console.log(obj5);