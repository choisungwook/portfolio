---
type: Topic
title: hidden 속성으로 감추는 패널은 자기 display 규칙에 조용히 진다
description: el.hidden은 true인데 화면에서 사라지지 않을 때, 원인이 JS가 아니라 CSS 우선순위에 있다는 판정과 한 줄 해결.
tags: [css, desktop, tauri, electron]
timestamp: 2026-08-02T00:00:00Z
---

## 문제

패널을 `el.hidden = true`로 감추는 코드는 읽기에 명확하고 테스트도 통과한다. 브라우저 기본 스타일시트에 `[hidden] { display: none }`이 있으니 이것만으로 끝나야 한다.

끝나지 않는 경우가 있다. 같은 요소에 저자 스타일시트가 `display`를 직접 지정해 두면, 저자 규칙이 브라우저 기본 규칙을 이기므로 요소는 계속 보인다. flex나 grid 레이아웃을 쓰는 패널이 정확히 이 조건에 걸린다.

```css
#props-text {
  display: flex; /* [hidden]의 display: none을 덮는다 */
  flex-direction: column;
}
```

## 왜 조용한가

세 가지가 겹쳐 신호가 없다.

첫째, JS 쪽은 정상이다. `el.hidden`은 `true`이고 DOM에도 속성이 붙어 있다. 콘솔에서 확인하면 코드가 맞다는 결론만 나온다. 잘못된 값은 `getComputedStyle(el).display` 하나뿐이고, 이건 일부러 보기 전에는 보이지 않는다.

둘째, 에러가 없다. 우선순위 충돌은 CSS가 설계대로 동작한 결과라 경고 대상이 아니다.

셋째, 증상이 원인과 멀다. 사용자가 보고하는 건 "도형에 폰트 선택이 왜 나오지"이고, 이건 조건 로직을 의심하게 만든다. 실제로 고칠 곳은 조건이 아니라 stylesheet다.

## 판정과 해결

`hidden`이 안 먹는 것 같으면 `el.hidden`과 `getComputedStyle(el).display`를 나란히 읽는다. 앞이 `true`인데 뒤가 `none`이 아니면 우선순위 문제로 확정된다. 조건 로직은 볼 필요가 없다.

고칠 때는 요소마다 `[hidden]` 셀렉터를 붙이지 말고 시트에 한 줄을 둔다. 원인이 브라우저 기본 규칙이 약하다는 것 하나이므로, 고치는 자리도 하나여야 나중에 추가되는 패널이 같은 함정에 다시 빠지지 않는다.

```css
[hidden] {
  display: none !important;
}
```

`!important`가 필요한 이유는 id 셀렉터로 지정된 `display`를 속성 셀렉터가 특정도로는 이길 수 없기 때문이다. 여기서는 `hidden`이 항상 이겨야 하는 것이 맞으므로 예외적으로 쓴다.

## 왜 반복되는가

`product/` 아래 데스크톱 앱은 번들러 없이 평문 HTML과 CSS를 쓴다. 이 조합에서 패널을 감추는 가장 자연스러운 방법이 `hidden` 속성이고, 패널을 세로로 쌓는 가장 자연스러운 방법이 `display: flex`다. 둘 다 옳은 선택인데 함께 쓰면 충돌한다. 그래서 새 앱을 만들 때마다 다시 만난다.

akbun-makepresentation에서는 이 규칙이 없어 속성 패널의 선/텍스트 그룹이 처음부터 한 번도 감춰지지 않았다. 텍스트 상자에만 있어야 할 폰트 선택이 사각형에도 나오면서 드러났다.
