# 목차
| 번호 | 문서바로가기 |
| --- | ---- |
| 1 | [webpack 설치](#webpack설치) |
| 2 | [webpack 실행](#webpackt실행) |
| 3 | [기본실행 결과](#기본실행결과) |
| 4 | [webpack 설정파일](#webpack.config.js) |
| 5 | [npmrun 설정](#npmrun설정) |

---

# 1. webpack 설치 <a name="webpack설치"> </a>
```sh
npm install webpack webpack-cli --save
```

<br>

# 2. webpack 실행 <a name="webpackt실행"> </a>
```sh
npx webpack
```

<br>

# 3. main.js생성 <a name="기본실행결과"></a>
* (기본설정) webpack은 결과를 dist/main.js에 저장

<br>

# 4. webpack.config.js <a name="webpack.config.js"></a>
* webpack설정 파일
* npx커맨드와 --config인자로 설정파일 실행
```sh
npx webpack --config webpack.config.js
```

<br>

# 5. npm run build 설정 <a name="npmrun설정"></a>
* npm run명령어 실행시 webpack빌드 설정
* script필드에 build필드 추가
```json
{
  "name": "Webpack_Getting_Start",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "build": "webpack"
  },
...
```
