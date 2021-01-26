# 개요
* 전개 연산자

# 필드값을 채워서 리턴
```javascript
const name = 'john';
const age = 10;

// console.log('name =', name, ', age =', age);
console.log({name, age});
```

# 배열 또는 객체 복사
```javascript
const obj1 = {name: 'john', age: 10};
const obj2 = {hobby: 'unknown'};
const obj3 = {...obj1, ...obj2};

console.log(obj3);
```
