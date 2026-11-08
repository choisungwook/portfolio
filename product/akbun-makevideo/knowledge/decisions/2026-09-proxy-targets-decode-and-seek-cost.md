---
type: Decision
title: 프록시는 해상도뿐 아니라 decode와 seek 비용을 줄인다
description: 코덱과 키프레임 간격을 해상도와 함께 판정하고 프록시에 짧은 GOP를 강제한 결정.
tags: [makevideo, proxy, playback, ffmpeg]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-08T05:00:00Z }
---

## 결정

* 장변 1920px 초과, H.264가 아닌 코덱, 관측된 키프레임 간격 2초 초과 중 하나면 프록시 생성
* 첫 30초 packet의 codec과 keyframe flag로 판정
* ffprobe 판정은 UI 실행 스레드 밖에서 최대 4개씩 병렬 수행
* 프록시 해상도는 확대 없이 최대 장변 1920px로 제한
* 프록시 키프레임은 0.5초 간격으로 강제
* manifest 정책 버전이 다르면 기존 프록시 재생성
* 하드웨어 가속이 확인된 장치에서는 원본도 `-hwaccel`로 디코드하고, CPU 디코드일 때만 decoder thread를 2개로 제한
* 하드웨어 인코더가 있으면 프록시 2개를 동시에 만들고, CPU 경로는 1개 유지
* 타임라인에서 먼저 쓰이는 asset부터 생성

## 이유

* preview quality는 합성 크기만 줄이고 원본 decoder 비용을 줄이지 못함
* 1080p도 HEVC·ProRes이거나 GOP가 길면 재생과 seek가 느릴 수 있음
* 여러 원본의 동기식 순차 probe는 프로젝트 열기와 저장 응답을 지연시킴
* 프록시의 짧은 GOP는 seek 뒤 디코드하고 버릴 프레임 구간을 제한함
* 해상도를 1280px까지 낮춰도 병목이 decoder와 seek면 얻는 이점이 적음
* 프록시가 필요한 원본(4K, HEVC, ProRes)은 CPU 2 thread 디코드가 생성 시간의 대부분이었음. 4K HEVC 20초 기준 28.3초가 하드웨어 디코드로 4.1초, 2개 동시 생성은 순차 56.7초가 6.2초
* media engine은 여러 세션을 동시에 처리하지만 CPU 인코딩을 2개 돌리면 편집 화면이 느려짐
