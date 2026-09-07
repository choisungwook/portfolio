---
type: Decision
title: URL 선저장과 경량 본문 추출
description: 링크 저장 성공을 추출 실패와 분리하고 로컬 workerd 측정으로 경량 파서 선택
tags: [reader, workers, extraction]
timestamp: 2026-09-07T00:00:00Z
---

## 결정

- URL 저장 성공 후 waitUntil에서 본문 추출과 AI 처리를 순서대로 실행
- HTML 256KB·수신 8초·리다이렉트 3회 제한과 목적지별 공개 주소 검사
- DOM 없는 htmlparser2 이벤트 파서 사용
- 기존 body 입력과 동일 URL 중복 방지 동작 유지
- Workers fetch는 redirect manual과 응답 상태 검사 사용

## 이유

- 추출 타임아웃·CPU 제한이 원문 링크 저장 실패로 이어지는 상황 방지
- 로컬 workerd에서 긴 HTML 추출의 회당 평균 CPU가 약 1.1~1.8ms로 측정됨
- Node에서는 허용되는 redirect error가 workerd에서는 TypeError를 발생시킴
- Node 테스트만으로 런타임 호환성을 보장할 수 없어 workerd 통합 테스트 추가

## Citations

1. [공유 저장 이슈](https://github.com/choisungwook/portfolio/issues/1212)
2. [측정·제약 기록](../../wiki/url-extraction.md)
