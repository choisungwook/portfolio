---
type: Decision
title: AI 비용 선예약과 문서 단위 태그 변경
description: 모델 호출 비용을 먼저 예약하고 문서 태그를 한 행에서 교체해 상한과 버전 검사를 원자적으로 처리
tags: [reader, d1, ai]
timestamp: 2026-09-07T00:00:00Z
---

## 결정

- AI 모델·키·호출당 최대 비용 미설정 시 비활성화
- 월 호출·원 단위 비용을 SQL 조건부 UPDATE로 선예약, 실패 시 환급 없음
- 기존 태그만 추천으로 저장, 사용자 승인 시 version 검사 후 반영
- 문서 태그는 tags_json에 저장, 전체 태그는 json_each로 조회
- 문서 변경 기록은 DB 트리거로 생성
- Access JWT의 서명·issuer·audience·만료 외에 설정한 owner sub도 확인

## 이유

- 공급자별 실제 과금 단위 차이와 동시 요청으로 월 상한이 초과되는 상황 방지
- 모델 실패와 태그 변경을 본문 저장 성공에서 분리
- 한 문서의 태그·위치·읽음 변경을 한 UPDATE로 처리해 충돌 시 일부만 반영되는 상황 방지
- Access 정책 변경 시 다른 계정의 개인 데이터 접근 방지

## Citations

1. [웹 UI](https://github.com/choisungwook/portfolio/issues/1213)
2. [AI 요약](https://github.com/choisungwook/portfolio/issues/1215)
