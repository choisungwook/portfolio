# WebKit ReadableStream 비동기 이터레이터 보강

## 결정

- 앱 시작 시 ReadableStream.prototype에 Symbol.asyncIterator를 없을 때만 설치
- PDF.js 호출부를 고치지 않고 런타임 결손만 채움

## 이유

- WKWebView는 ReadableStream 비동기 이터레이터를 구현하지 않아 PDF.js getTextContent()가 TypeError로 끊김
- 텍스트 레이어, 검색, AI 요약이 모두 같은 호출을 거쳐 한 곳에서 막아야 전부 살아남음
