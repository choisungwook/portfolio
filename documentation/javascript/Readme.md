# 객체생성을 객체로 감싸기
규모가 점점 커지면 객체생성을 관리하기 쉽게 클래서로 한번 감싸기
```typescript
/*
  객체를 생성할 때는 class를 활용하는 것을 추천
*/

type Box = {
  width: number,
  height: number
}

class Shape implements Box {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

// 방법 1 - 객체를 바로 생성
const boxA: Box = {
  width: 200,
  height: 200
}

// 방법 2 - class를 객체로 감싸서 생성
const boxB = new Shape(10, 10);

// 클래스 구분
if(boxB instanceof Shape){
  console.log("boxB is Shape");
}

```


----- 아래는 임시 글 ----------

# 모듈
## 정의
* 자바스크립트 파일에 정의된 함수, 변수를 외부에서 접근하려면 모듈을 설정해야 합니다.

## 사용방법
* export를 사용해서 외부에서 접근할 수 있는 함수, 변수를 설정할 수 있습니다.
* export는 named, default 두 종류가 있습니다.

## default export
* default export는 모듈에 기본으로 제공되는 export입니다. 한 모듈에 오직 한개의 default export만 가질 수 있습니다.
* 모듈에서 export하고하는 대상을 default export하나로 export하는 특징을 가집니다.
* import할 때 원하는 이름으로 import할 수 있습니다. 단, nodejs에서는 모듈과 확장자(.js)까지 경로를 설정해야 합니다.
> nodejs에서 ES6 import, export를 사용하려면 packages.json의 type값을 module로 변경해야 합니다.

```javascript
//calc.js
function plus (a, b) {
    return a + b;
};

function minus (a, b) {
    return a - b;
}

export default { plus, minus };
```

```javascript
//app.js
import math from "./calc";

console.log(math.plus(1,2));
console.log(math.minus(1,2));
```

## named export
* 이름에서 알 수 있듯이 export할 함수와 변수에 이름을 설정하는 방법입니다.
* named export의 특징은 export하는 이름 그대로 import해야 합니다.

## 어떻게 import해야 좋은 방법일까?
* 정답은 없습니다. 파일 전체의 함수를 모듈로 export한다면 default export가 편할 수 있습니다.
* 몇 개의 함수, 변수를 export할 때는 named export를 사용하는 것이 좋을 수 있습니다.

## 참고자료
* https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Statements/export
* https://www.daleseo.com/js-node-es-modules/
* https://youtu.be/WUirHxOBXL4