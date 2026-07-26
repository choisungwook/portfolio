/**
 * exporter(모델 → 학습지 HTML)의 순수 문자열 로직을 검증한다.
 *
 * export가 깨지면 편집 결과물이 학습지로 열리지 않으므로, 토큰 치환과
 * 좌표 inline style 생성이 정확한지 확인한다. 컴파일된 renderer 스크립트는
 * 전역 script라 require할 수 없어 vm으로 실행해 함수를 꺼낸다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../dist/renderer/exporter.js"), "utf-8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { objectWrapper, exportStudysheet } = context;

/** 최소 모델을 만든다. shell에는 페이지 토큰 두 개와 원본 script가 남아 있다. */
function makeDoc() {
  return {
    version: 1,
    title: "테스트",
    sourcePath: null,
    shellHtml:
      "<html><head><style>.page{}</style></head><body>" +
      '<section class="page cover"><!--PPTE:PAGE:0--></section>' +
      '<section class="page"><!--PPTE:PAGE:1--></section>' +
      "<script>quiz()</script></body></html>",
    pages: [
      { cls: "page cover", objects: [{ id: "o0", x: 8, y: 6.25, w: 84, html: "<h1>제목</h1>" }] },
      { cls: "page", objects: [{ id: "o0", x: 10, y: 20, w: 50, html: "<p>본문</p>" }] },
    ],
  };
}

test("objectWrapper는 %좌표 inline style과 data-oid를 붙인다", () => {
  const html = objectWrapper({ id: "o3", x: 12.5, y: 40, w: 30, html: "<p>내용</p>" });
  assert.match(html, /class="ppte-obj"/);
  assert.match(html, /data-oid="o3"/);
  assert.match(html, /left:12\.5%;top:40%;width:30%/);
  assert.ok(html.endsWith("<p>내용</p></div>"));
});

test("exportStudysheet는 페이지 토큰을 각 페이지 내용으로 치환한다", () => {
  const html = exportStudysheet(makeDoc());
  assert.doesNotMatch(html, /PPTE:PAGE/, "치환되지 않은 토큰이 남았다");
  assert.match(html, /<h1>제목<\/h1>/);
  assert.match(html, /<p>본문<\/p>/);
  assert.match(html, /<script>quiz\(\)<\/script>/, "원본 script가 사라졌다");
});

test("객체 내용의 $& 같은 치환 패턴이 그대로 보존된다", () => {
  const doc = makeDoc();
  doc.pages[0].objects[0].html = "<p>가격은 $100, 패턴 $&amp; 유지</p>";
  const html = exportStudysheet(doc);
  assert.match(html, /가격은 \$100, 패턴 \$&amp; 유지/, "$ 패턴이 치환 과정에서 깨졌다");
});
