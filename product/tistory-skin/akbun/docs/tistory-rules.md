# 티스토리 스킨 작성 규칙

이 문서는 실제 스킨 개발 과정에서 발견한 규칙을 정리한 것이다.

- 티스토리 스킨 개발 가이드: https://tistory.github.io/document-tistory-skin/common/basic.html

## 필수 파일

티스토리 관리자 → 꾸미기 → 스킨등록에서 3개 파일을 개별 업로드한다.

- `skin.html` — 스킨 HTML 템플릿
- `style.css` — 스타일시트
- `index.xml` — 스킨 메타 정보 (이름, 버전, 기본 설정)

## 블록 태그 구조

`<s_*>` 블록 태그는 티스토리 파서가 처리한다. 잘못 쓰면 오류 메시지 없이 스킨 적용이 실패한다.

### skin.html 안 블록 태그 배치 순서

```text
<s_t3>
  <s_sidebar> ... </s_sidebar>
  <s_article_rep>
    <s_index_article_rep> ... </s_index_article_rep>
    <s_permalink_article_rep> ... </s_permalink_article_rep>
  </s_article_rep>
  <s_notice_rep>
    <s_index_article_rep> ... </s_index_article_rep>
    <s_permalink_article_rep> ... </s_permalink_article_rep>
  </s_notice_rep>
  <s_article_protected>
    <s_index_article_rep> ... </s_index_article_rep>
    <s_permalink_article_rep> ... </s_permalink_article_rep>
  </s_article_protected>
  <s_list> ... </s_list>
  <s_paging> ... </s_paging>        ← s_list 밖에 배치해야 모든 페이지에서 동작
  <s_page_rep> ... </s_page_rep>    ← 빠지면 정적 페이지가 깨질 수 있음
  <s_tag> ... </s_tag>
  <s_guest> ... </s_guest>
</s_t3>
```

### 자주 실수하는 것

- `s_article_protected` 안에 `s_index_article_rep`과 `s_permalink_article_rep`을 **모두** 넣어야 한다. 하나라도 빠지면 파싱 에러가 날 수 있다.
- `s_page_rep`은 반드시 포함한다. 정적 페이지용 블록이다.
- `s_paging`을 `s_list` 안에 넣으면 홈에서 `s_list`를 CSS로 숨길 때 페이징도 같이 사라진다. 최상위에 배치한다.

## 치환자 규칙

값 치환자(`[##_..._##]`)와 블록 태그(`<s_*>`)를 구분해야 한다.

- `[##_tag_label_rep_##]`은 **값 치환자**다. `<s_tag_label_rep>` 블록 태그로 쓰면 안 된다.
- `[##_comment_group_##]`은 댓글 전체를 자동 렌더링하는 값 치환자다. 수동 구현(`<s_rp>` 등)보다 간단하다.
- `[##_guestbook_group_##]`도 마찬가지로 방명록을 자동 렌더링한다.
- 존재하지 않는 치환자를 쓰면 파싱 에러가 난다. 오류 메시지는 나오지 않는다.

## 페이지 유형 구분

티스토리는 `<body id="[##_body_id_##]">`로 페이지 유형을 구분한다. CSS에서 body ID로 레이아웃을 전환한다.

| body ID | 페이지 |
|---|---|
| `tt-body-index` | 홈 |
| `tt-body-page` | 포스트 상세 |
| `tt-body-category` | 카테고리 |
| `tt-body-search` | 검색 결과 |
| `tt-body-tag` | 태그 필터 |
| `tt-body-guestbook` | 방명록 |

## 중복 렌더링 처리

홈에서는 `s_article_rep`과 `s_list`가 동시에 렌더링된다. 카테고리/검색/태그 페이지에서도 마찬가지다. CSS로 페이지별 중복을 숨겨야 한다. 이를 위해 skin.html에서 `s_article_rep`과 `s_list` 내용을 각각 wrapper div(`.article-section`, `.list-section`)로 감싸야 한다.

이 스킨의 홈 fallback은 CSS `:has()`에 의존한다. 따라서 지원 대상은 최신 Chromium/Safari/Edge 계열 브라우저로 본다. `:has()`를 지원하지 않는 구형 브라우저는 공식 지원 범위에서 제외한다.

```css
/* 홈: s_list 숨김 (s_article_rep만 표시) */
#tt-body-index .list-section { display: none; }

/* 카테고리/검색/태그: s_article_rep 숨김 (s_list만 표시) */
#tt-body-category .article-section,
#tt-body-search .article-section,
#tt-body-tag .article-section { display: none; }
```
