const square = function(x) {
  return x*x;
}

// 자바스크립트는 함수를 값으로 취급하므로, 변수에 함수를 할당할 수 있다.
const foo = square;

console.log(foo(6));
