# 작업 후 검증 체크리스트

- 작업을 마친 뒤 이 문서를 위에서 아래로 순서대로 확인한다. preview 파일을 읽어서 확인할 수 있는 항목은 소스를 직접 확인하고, 브라우저에서만 확인 가능한 항목은 최종 응답에 "수동 확인 필요"로 표시한다.
- UI나 구조를 바꿨으면 이 문서도 함께 갱신할지 사용자에게 확인한다. 최종 응답에는 확인한 항목을 표 형식으로 정리한다.

## 홈 글목록

티스토리는 블로그 설정에 따라 홈 글목록을 `s_article_rep` 또는 `s_list` 중 하나로만 내려보낼 수 있다. 어느 쪽으로 렌더링되든 글이 보여야 하므로 두 섹션을 모두 유지하고, CSS `:has()` 셀렉터로 fallback 전환하는 구조가 핵심이다.

`/preview.html`에서 글 목록과 pagination이 함께 보이는지 확인한다.

**HTML 구조** — `article-section`과 `list-section` 래퍼가 모두 존재해야 한다.

```html
<div class="article-section">
<s_article_rep>
<div class="list-section">
<s_list>
```

**CSS fallback** — `article-section`에 `.post-row`가 있으면 `list-section`을 숨기고, 없으면 반대로 전환한다. 이 패턴이 깨지면 홈에서 글목록이 통째로 사라진다.

```css
#tt-body-index .list-section {
  display: block;
}

#tt-body-index .main-layout:has(.article-section .post-row) .list-section {
  display: none;
}

#tt-body-index .main-layout:not(:has(.article-section .post-row)) .article-section {
  display: none;
}

#tt-body-index .main-layout:not(:has(.article-section .post-row)) .list-header {
  display: none;
}
```

## 홈 사이드바

- 운영 블로그에서 카테고리/태그가 안 보이는 문제는 대부분 `s_sidebar_element`를 여러 개로 쪼갰을 때 발생한다. 검색, 태그, 카테고리, 방문자 수를 하나의 `s_sidebar_element` 안에 유지해야 안전하다.
- `/preview.html`에서 검색창, 태그, 카테고리, 방문자 수가 모두 보이는지 확인한다.
- **HTML 구조** — 하나의 `s_sidebar_element` 안에 모든 요소가 있어야 한다.

```html
<s_sidebar_element>
<h2 class="sidebar-title">글 검색</h2>
<div class="search-bar">
<h2 class="sidebar-title">태그</h2>
<h2 class="sidebar-title">카테고리</h2>
<div class="visitor-stats">
```

- **CSS** — 사이드바 제목과 방문자 통계 스타일을 유지한다.

```css
.sidebar-title {
  color: var(--color-heading-primary);
}

.visitor-stat {
  font-size: 0.75rem;
}
```

## 홈 pagination

페이지 이동이 정상 동작하는지 `/preview.html`, `/preview-page-2.html`, `/preview-page-3.html`을 차례로 확인한다. 실스킨 pagination 토큰은 아래 공식 형식을 그대로 유지해야 한다 — 토큰 이름을 바꾸면 티스토리 파서가 인식하지 못한다.

```html
<a [##_prev_page_##] class="page-prev [##_no_more_prev_##]">
<a [##_paging_rep_link_##] class="page-num">
<a [##_next_page_##] class="page-next [##_no_more_next_##]">
```

## 포스트 상단과 ToC

`/preview-post.html`에서 다음을 확인한다.

- "글 목록으로 돌아가기" 링크가 존재하는지
- 데스크톱 폭(1400px 이상)에서 floating ToC가 보이는지
- ToC가 본문 `h1`, `h2`를 수집하는지

**HTML 구조**

```html
<div id="floating-toc" class="floating-toc">
<nav id="toc-nav"></nav>
```

**JS** — ToC 생성 셀렉터를 변경하면 목차가 비게 된다.

```js
document.querySelectorAll(".post-body h1, .post-body h2")
```

**CSS** — ToC 폰트 크기와 반응형 숨김 처리를 유지한다.

```css
.floating-toc-header {
  font-size: 0.9375rem;
}

.toc-link {
  font-size: 1.125rem;
}

@media (max-width: 1400px) {
  .floating-toc {
    display: none;
  }
}
```

## 포스트 본문 계층과 폭

`/preview-post.html`에서 `h1`, `h2`, `h3` 샘플이 시각적으로 구분되는지 확인한다. 본문 `h1`이 다크레드(`#7a2f2f`)로 표시되는 것은 이 스킨의 핵심 디자인 요소다 — `!important`와 자식 요소 오버라이드가 함께 있어야 티스토리 에디터가 삽입하는 인라인 스타일을 덮어쓸 수 있다.

```css
:root {
  --content-max: 780px;
  --color-heading-primary: #7a2f2f;
}

.post-body {
  font-size: 1.0625rem;
}

.post-body h1 {
  font-size: 1.75rem;
  color: var(--color-heading-primary) !important;
}

.post-body h1 span,
.post-body h1 a,
.post-body h1 strong,
.post-body h1 b {
  color: var(--color-heading-primary) !important;
}

.post-body h2 {
  font-size: 1.3125rem;
}

.post-body h3 {
  font-size: 1.125rem;
}
```

## 포스트 댓글

`/preview-post.html`에서 댓글 제목과 댓글 영역이 표시되는지 확인한다. 댓글 블록 태그와 입력폼 토큰은 티스토리 파서가 요구하는 구조이므로 순서와 중첩을 변경하면 댓글 기능이 깨진다.

```html
<s_rp>
<s_rp_container>
<s_rp_rep>
<s_rp2_container>
<s_rp2_rep>
<s_rp_input_form>
[##_rp_input_comment_##]
```

**CSS** — 댓글 관련 클래스가 존재하는지 확인한다.

```css
.comments-title {
}

.comment-thread {
}

.comment-form {
}
```

## index.xml 기본값

스킨 메타 정보가 바뀌면 티스토리 관리자에서 스킨 인식에 문제가 생길 수 있다. 아래 값을 유지한다.

```xml
<description>악분 스킨</description>
<entriesOnPage>10</entriesOnPage>
<entriesOnList>20</entriesOnList>
<showListLock>0</showListLock>
```
