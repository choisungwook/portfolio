# design

## design 의도

- homepage 레이아웃은 3:7. 3이 왼쪽메뉴, 7이 글 목록
- 왼쪽메뉴에는 카테고리와 태그를 위치
- 레이아웃 7에 해당하는 글 목록은 글 제목과 글 작성날짜를 리스트로 표시. 글 작성날짜는 글 제목보다 글씨가 작아야 함
- 상단 헤더는 티스토리 메뉴를 위치
- 글 포스트 레이아웃 컨텐츠를 보여주고, 컨텐츠가 끝나면 댓글을 위치

## design style

- 산세리프, 쿨 화이트(`#fafafa`) 미니멀 디자인
- bold는 핑크색(`#ec4899`)
- 코드블록은 다크 배경 + Prism.js `prism-tomorrow`
- 포스트 상세 우측에 floating ToC(1400px 이하 숨김)
- CSS에서 `<body id="[##_body_id_##]">`로 페이지 유형에 따라 레이아웃 전환
- 홈(`tt-body-index`)은 사이드바 + 글 목록
- `s_list` 숨김
- 포스트(`tt-body-page`)는 사이드바 숨김
- 카테고리/검색/태그는 `s_article_rep` 숨기고 `s_list`만 표시
- `s_paging`은 `s_list` 밖 최상위에 배치
