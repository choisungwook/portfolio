# important_guidelines

> deprecated.

아래 항목을 반드시 우선순위 높게 생각해야 한다.

- 구글 애드센스를 규칙을 준수
- `s_article_protected` 안에 `s_index_article_rep`과 `s_permalink_article_rep`을 모두 넣는다.
- `s_page_rep` 블록 필수
- `[##_tag_label_rep_##]`은 값 치환자다. 존재하지 않는 치환자를 쓰면 파싱 에러.
- 홈 글목록은 블로그 설정이나 티스토리 렌더링 방식에 따라 `s_article_rep` 대신 `s_list`로만 내려올 수 있다.
- 그래서 홈에서는 `article-section`과 `list-section`을 둘 다 유지하고, CSS는 `article-section`에 실제 `.post-row`가 있을 때만 `list-section`을 숨기는 fallback 구조여야 한다.
- 홈에서 `최신글` 제목과 pagination은 보이는데 글목록만 안 보이면, 먼저 `s_list`가 CSS로 숨겨졌는지 의심한다.
- 운영 블로그에서 검색만 보이고 카테고리/태그가 안 보이면, `s_sidebar_element`를 여러 개로 쪼갠 구조를 먼저 의심한다. 커스텀 사이드바는 하나의 `s_sidebar_element` 안에 search/category/tag/visitor를 함께 두는 편이 안전하다.
