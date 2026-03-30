# Card News Reference -- AI Agent용 카드뉴스 레이아웃 레퍼런스

## 개요

AI agent가 카드뉴스(HTML)를 생성할 때 참고하는 레이아웃 레퍼런스 모음이다.

## 왜 만들었나

- AI로 카드뉴스를 만들 때 참조할 레이아웃 레퍼런스가 갖고 싶었다
- AI agent가 카드뉴스를 생성할 때 일관된 레이아웃 기준이 없으면 매번 품질이 들쑥날쑥하다
- 레이아웃을 코드(HTML/CSS)로 관리하면 git pull로 자신만의 레이아웃을 추가할 수 있다

## 레이아웃 목록

| 번호 | 파일 | 타입 | 용도 |
|------|------|------|------|
| 1 | [quote-highlight.html](./public/layouts/quote-highlight.html) | 인용 강조형 | 핵심 문구에 노란 형광펜 강조. 인용문, 질문형 카드 |
| 2 | [journal-elegant.html](./public/layouts/journal-elegant.html) | 저널 감성형 | 베이지 배경, 세리프풍 텍스트. 에세이, 감성 글귀 |
| 3 | [tip-highlight.html](./public/layouts/tip-highlight.html) | 팁/교육형 | 파란 타이틀 + 베이지 하이라이트 + 설명 본문 |
| 4 | [review-testimonial.html](./public/layouts/review-testimonial.html) | 리뷰/후기형 | Review 제목 + 따옴표 + 후기 텍스트 + 출처 |
| 5 | [notice-section.html](./public/layouts/notice-section.html) | 공지/설명형 | NOTICE 헤더 + 아이콘 섹션별 제목/설명 |
| 6 | [faq-answer.html](./public/layouts/faq-answer.html) | FAQ/답변형 | 큰 타이틀 + dash 섹션 + 점선 구분선 |

## 사용 방법

### 웹 갤러리

배포된 웹 갤러리에서 모든 레이아웃을 미리보기할 수 있다: <https://cardref.akbun.com>

### 로컬에서 확인

Astro 개발 서버를 실행한다:

```bash
cd product/cardnews-reference && npm install && npm run dev
```

또는 HTML 파일을 직접 브라우저에서 연다:

```bash
open public/layouts/quote-highlight.html
```
