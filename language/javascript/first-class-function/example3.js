function execute(a){
  a();
}

function greeting() {
  console.log('hello world');
}

// 자바스크립트에서 함수는 값으로 취급될 수 있으므로, 함수 자체를 다른 함수의 인자로 전달할 수 있다.
execute(greeting);
