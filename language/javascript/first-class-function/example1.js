function greeting() {
  console.log('Hello World');
}

// 함수에 프로퍼티 추가
// 함수를 객체처럼 취급
// 이 예제처럼 자바스크립트에서는 모든 것을 값으로 취급한다. 그러므로 함수도 값이다.
greeting.lang = 'Korean';

greeting();
console.log(greeting.lang);
