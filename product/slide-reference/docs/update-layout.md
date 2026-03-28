# 레이아웃 추가/수정 가이드

이 문서는 새 레이아웃을 추가하거나 기존 레이아웃을 수정하는 절차를 설명한다.

## AI agent에게 요청하는 방법

간단하게 말하면 된다:

- 기존 타입의 변형: "study 레이아웃의 dark 변형 추가해줘"
- 새 타입: "workshop 타입 레이아웃 만들어줘. 실습 단계별 핸즈온 발표용이야"
- 색상 변경: "community 레이아웃에 따뜻한 톤 색상 팔레트 적용해줘"

## 기존 타입의 변형 추가

기존 타입(study, community, executive, comparison, timeline)에 dark, minimal 같은 변형을 추가하는 경우.

### Step 1: HTML 파일 생성

`public/layouts/`에 파일을 만든다. 네이밍 규칙은 `{type}-{variant}.html`이다.

```
public/layouts/study-dark.html
```

파일 상단에 주석 메타데이터를 포함한다:

```html
<!--
  Layout: 공부용 다크
  Type: study
  Purpose: 어두운 배경의 개념 정리 레이아웃. 야간 발표에 적합.
  Font-size: 16px-22px 권장
-->
```

### Step 2: 갤러리 등록

`src/pages/index.astro`의 layouts 배열에 항목을 추가한다:

```js
{
  file: 'study-dark.html',
  name: '공부용 다크',
  type: 'study',
  purpose: '어두운 배경의 개념 정리 레이아웃. 야간 발표에 적합.',
  fontSize: '16px-22px',
  color: '#2563EB',
},
```

## 새 타입 추가

기존에 없는 타입(예: workshop, dashboard)을 만드는 경우. 변형 추가보다 업데이트할 파일이 많다.

### Step 1-2: HTML 파일 생성 + 갤러리 등록

위 "기존 타입의 변형 추가"와 동일하다.

### Step 3: README.md 레이아웃 목록 테이블에 추가

```markdown
| [workshop-default.html](./public/layouts/workshop-default.html) | 핸즈온용 | 실습 단계별 진행. 워크샵, 튜토리얼 |
```

### Step 4: docs/layout-guide.md에 타입 설명 추가

타입별 사용 가이드 테이블과 상세 설명 섹션에 새 타입을 추가한다.

## 색상 팔레트 추가

`docs/color-palettes.md`에 8역할 테이블을 추가한다:

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
