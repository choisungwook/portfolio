# akbun Tistory Skin

악분 티스토리 스킨

## 특징

- 썸네일 없는 간단한 글 목록
- homepage는 3:7 비율 레이아웃 (태그/카테고리 사이드바 + 글 목록)
- 반응형 디자인 (모바일/태블릿/데스크톱)
- 콘텐츠는 글을 읽을 집중해서 읽을 수 있도록 글만 표시하고, 오른쪽 목차를 보여주는 ToC적용
- 굵은 글씨는 핑크색으로 표시

## 벤치마크

| 대상 | 참고 요소 |
|---|---|
| [snack.planetarium.dev](https://snack.planetarium.dev/kor/) | 썸네일 없는 담백한 글 목록 |
| [claude.com/blog](https://claude.com/blog) | 태그 필터링, 리스트뷰, hover dimming |
| [claude.com/blog/post](https://claude.com/blog/harnessing-claudes-intelligence) | 포스트 레이아웃, 타이포그래피 |

## 설치 방법

1. 티스토리 관리자 → 스킨 편집 → HTML 편집
2. `skin.html` 내용을 HTML에 붙여넣기
3. `style.css` 내용을 CSS에 붙여넣기
4. `index.xml` 내용을 스킨 정보 파일에 반영

## 로컬에서 미리보기

배포 전에 로컬에서 확인하는 방법이다. 브라우저에서 확인할 수 있다.

```bash
make preview
```

- 메인 페이지: <http://localhost:3000/preview.html>
- 포스트 페이지: <http://localhost:3000/preview-post.html>
