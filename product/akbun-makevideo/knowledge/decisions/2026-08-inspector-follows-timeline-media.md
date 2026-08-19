---
type: Decision
title: Inspector는 타임라인에서 선택한 미디어 트랙을 따른다
description: 연결된 clip의 Video와 Audio 속성을 분리하고 선택한 트랙의 탭을 먼저 보여 주는 결정.
tags: [makevideo, inspector, timeline, selection]
timestamp: 2026-08-19T10:59:15Z
---

# Inspector는 타임라인에서 선택한 미디어 트랙을 따른다

## 결정

* Inspector는 별도 드롭 대상이 아니라 타임라인 clip 선택을 자동 반영
* 연결된 영상과 오디오는 Video와 Audio 탭으로 속성을 분리
* 선택한 트랙 종류와 같은 탭을 먼저 표시
* 영상에 내장 오디오만 있고 연결된 audio clip이 없으면 영상 clip을 Audio 속성 대상으로 사용

## 이유

* Inspector에 미디어를 다시 드롭하면 타임라인 선택과 편집 대상이 서로 달라질 수 있음
* opacity와 volume을 한 화면에 두면 연결된 clip 중 어느 속성을 바꾸는지 구분하기 어려움
* video-only 배치에서도 원본 영상의 내장 오디오 volume은 조절할 수 있어야 함
