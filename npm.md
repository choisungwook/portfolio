# 목차
| 번호 | 문서바로가기 |
| ---- | ---- |
| 1 | [npm이란?](#npm정의) |
| 2 | [npm설치](#npm설치) |
| 3 | [npx이란](#npx정의) |


---

# 1. npm이란? <a name="npm정의"></a>
 * Node package manager
 
 # 2. 설치 <a name="npm설치"></a>
 * 기본 설치
 ```sh
 npm install [패키지 이름] --save
 ```
 
 * 개발용 설치 <a name="npx정의"></a>
 ```sh
 npm install [패키지 이름] --save-dev
 ```
 
 * 배포용 설치
 ```sh
 npm install [패키지 이름] --save-prod
 ```

# 3. npx란?
* node패키지를 설치하지 않고, npm 패키지를 1회성으로 즉석 실행
* 테스트에 적합
> npx이 나오기 전에는 테스트를 할 지라도 필요한 node패키지 설치 요구
