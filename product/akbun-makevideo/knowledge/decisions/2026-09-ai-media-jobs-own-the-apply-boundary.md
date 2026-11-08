---
type: Decision
title: AI media 작업이 분석부터 편집 적용까지 소유한다
description: 전사와 무음 분석은 문서 revision을 고정하고 마지막에 단일 undo 편집으로 적용한다.
tags: [makevideo, ai, transcription, timeline, undo]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-08T00:00:00Z }
---

# AI media 작업이 분석부터 편집 적용까지 소유한다

## 결정

* 작업 시작 시 project snapshot과 document revision 저장
* 실행 중 일반 편집과 project 전환 차단
* 전처리, 분석, 전사, 명령 생성, 적용 상태를 event로 전달
* 취소 시 ffmpeg process와 HTTP future 중단
* 적용 직전 revision 재검사
* 자막 교체와 전체 track 무음 제거를 각각 단일 undo step으로 적용
* 임시 MP3와 chunk는 작업 전용 임시 디렉터리 수명으로 정리
* 예외: 군더더기 말 제거는 분석 결과를 검토 목록으로 끝내고, 사용자가 체크한 항목만 별도 apply 호출이 같은 revision 검사 후 단일 undo step으로 적용

## 이유

* 긴 분석 도중 timeline이 바뀌면 timestamp와 실제 frame이 어긋남
* 분석 성공 뒤 부분 적용되면 사용자가 undo 횟수를 예측할 수 없음
* 작업이 apply 경계를 소유하면 취소, 실패, stale 결과가 timeline 일부를 남기지 않음
* 군더더기 판단은 작은 로컬 모델이 틀릴 수 있어 말을 잘라내기 전에 사람이 확인해야 함. 무음과 자막은 결과가 결정적이거나 되돌리기 쉬워 바로 적용함
