---
type: Decision
title: 재생은 HTMLAudioElement, 파형은 Web Audio로 분리
description: 배속 시 음정 유지를 위해 재생 경로와 파형 계산 경로를 분리했다.
tags: [electron, audio, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

재생은 HTMLAudioElement(blob URL)로 하고, Web Audio API(decodeAudioData)는 파형 peak 계산에만 쓴다. 파일 바이트는 IPC(audio:read)로 한 번 읽어 두 경로가 공유한다.

## 이유

- 언어 공부에서 배속 재생은 음정이 유지되어야 한다. HTMLAudioElement.playbackRate는 preservesPitch가 기본 켜져 있어 음정을 유지하지만, AudioBufferSourceNode.playbackRate는 테이프처럼 음정이 함께 변한다.
- 재생까지 Web Audio로 합치면 seek·pause·배속을 직접 구현해야 한다. HTMLAudioElement가 이를 모두 제공한다.
- blob URL을 쓰면 한글·공백이 든 파일 경로의 file:// URL 인코딩 문제를 피할 수 있고, 렌더러가 파일 시스템에 직접 접근하지 않는다.
