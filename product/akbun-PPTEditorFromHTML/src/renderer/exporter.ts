/**
 * 모델 → 학습지 HTML 문자열. 순수 문자열 조합이라 node 테스트(test/exporter.test.js)로 검증한다.
 * shell에 남은 원본 style/script 덕에 export 결과에서 퀴즈·페이지 넘김이 그대로 동작한다.
 */

function objectWrapper(obj: SheetObject): string {
  return `<div class="ppte-obj" data-oid="${obj.id}" style="left:${obj.x}%;top:${obj.y}%;width:${obj.w}%">${obj.html}</div>`;
}

function pageInnerHtml(page: SheetPage): string {
  return page.objects.map(objectWrapper).join("\n");
}

function exportStudysheet(sheetDoc: SheetDoc): string {
  let html = sheetDoc.shellHtml;
  sheetDoc.pages.forEach((page, i) => {
    // 치환 문자열에 $&, $1 같은 패턴이 있어도 그대로 들어가도록 함수 형태를 쓴다.
    html = html.replace(`<!--PPTE:PAGE:${i}-->`, () => pageInnerHtml(page));
  });
  return html;
}
