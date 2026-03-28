# 미래 AI Agent를 위한 확장 가이드

이 문서는 이 프로젝트를 확장할 **미래의 AI agent**를 위한 안내서다. 사용자가 git pull 후 자신만의 레이아웃과 색상을 추가하고, agent가 그것을 활용하도록 돕는다.

## 레이아웃 추가 방법

새 레이아웃을 추가하려면 `layouts/` 디렉터리에 HTML 파일을 만든다.

파일 네이밍 규칙:

```
layouts/{type}-{variant}.html
```

- `type`: 레이아웃 타입 (study, community, executive, comparison, timeline, 또는 새로운 타입)
- `variant`: 변형 이름 (default, dark, minimal 등)

각 레이아웃 HTML 파일은 다음 구조를 따른다:

```html
<!--
  Layout: {레이아웃 이름}
  Type: {타입}
  Purpose: {어떤 발표에 적합한지}
  Font-size: {권장 폰트 크기 범위}
-->
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{레이아웃 이름}</title>
  <style>
    /* CSS 스타일 */
  </style>
</head>
<body>
  <!-- 슬라이드 콘텐츠 -->
</body>
</html>
```

## 색상 팔레트 추가

`docs/color-palettes.md`에 새 팔레트를 추가할 수 있다. 팔레트는 다음 형식을 따른다:

```markdown
### 팔레트 이름

| 역할 | 색상 코드 | 용도 |
|------|-----------|------|
| primary | #XXXXXX | 제목, 강조 |
| secondary | #XXXXXX | 부제목, 보조 강조 |
| background | #XXXXXX | 슬라이드 배경 |
| surface | #XXXXXX | 카드, 도형 배경 |
| text | #XXXXXX | 본문 텍스트 |
| text-secondary | #XXXXXX | 부가 설명 |
| accent | #XXXXXX | 아이콘, 포인트 |
| border | #XXXXXX | 구분선, 테두리 |
```

## 새 레이아웃 타입 등록

새 타입을 추가하면 다음 파일들을 업데이트한다:

1. `AGENTS.md` — 레이아웃 타입 테이블에 추가
2. `README.md` — 레이아웃 목록 테이블에 추가
3. `docs/layout-guide.md` — 타입별 설명에 추가

## 반응형 폰트 시스템

모든 레이아웃은 CSS 변수 `--base-font-size`를 기준으로 상대 단위(`em`, `rem`)를 사용한다. 폰트 크기를 변경하려면 이 변수만 조정하면 된다.

```css
:root {
  --base-font-size: 18px;
}
```

도형 안 텍스트는 `overflow`, `text-overflow`, `word-break` 속성으로 가독성을 보장한다. 새 레이아웃을 만들 때도 이 패턴을 따른다.

## AI Agent가 이 레퍼런스를 사용하는 방법

1. 사용자가 PPT 생성을 요청하면 `slide-presentation` skill이 발동한다
2. Skill은 `layouts/` 디렉터리의 HTML 파일들을 레퍼런스로 참조한다
3. 사용자의 발표 목적에 맞는 레이아웃 타입을 선택한다
4. 레이아웃의 구조와 스타일을 기반으로 슬라이드를 생성한다

## 향후 확장 아이디어

- 애니메이션 프리셋 (fade-in, slide-up 등)
- 차트/그래프 레이아웃 (데이터 시각화용)
- 인터랙티브 슬라이드 (클릭으로 상세 내용 표시)
- 다크/라이트 모드 자동 전환
- 인쇄용 레이아웃 (PDF 내보내기 최적화)
- 발표자 노트 영역
- QR 코드 자동 삽입 레이아웃
