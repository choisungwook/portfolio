const arr1 = [1,2,3];
const arr2 = [];

// 고차함수를 활용하지 않는 경우
for(let i=0; i<arr1.length; i++) {
  arr2.push(arr1[i] * 2);
}

console.log(arr2);

// 고차함수를 활용하는 경우
const functionMultipy = function(v) {
  return v * 2;
}

const arr3 = arr1.map(functionMultipy);
console.log(arr3);

const arr4 = arr1.map(function(v) {
  return v * 2;
})

console.log(arr4);

const arr5 = arr1.map(v => v * 2);

console.log(arr5);
