---
type: Decision
title: 잡음 제거 강도는 감쇠량과 잡음 바닥을 함께 올린다
description: afftdn의 잡음 추적 대신 강도 하나로 nr과 nf를 정하고, 같은 필터 문자열을 미리보기와 렌더가 공유한다.
tags: [makevideo, audio, ffmpeg, denoise]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-08T00:00:00Z }
---

## 결정

* 클립의 denoise 0..1 하나만 저장. 0은 꺼짐
* ffmpeg afftdn에 nr 12..36 dB, nf -55..-30 dB를 강도에 비례해 전달
* tn=1(잡음 바닥 추적)은 사용하지 않음
* 필터 문자열은 render의 denoise_audio_filter 한 곳에서 만들고, 렌더 audio chain과 미리보기 decoder가 모두 이 함수를 호출
* 속도 변경 앞, 녹음된 원본에 먼저 적용

## 이유

* 흰 잡음 위의 톤으로 측정했을 때 tn=1은 바닥을 시작값 근처에 묶어 두어 잡음이 거의 줄지 않았음. 끄자 잡음 구간이 20 dB 넘게 줄고 톤 레벨은 0.5 dB 안에서 유지됨
* 고정 nf 하나로는 조용한 방 잡음과 큰 광대역 잡음을 같이 다룰 수 없어 강도로 바닥을 옮김
* 미리보기와 출력이 같은 함수의 문자열을 쓰면 들은 소리와 파일의 소리가 어긋날 수 없음. audio/tests/amix.rs가 두 결과를 표본 단위로 비교함
* 모델 파일이 필요한 arnndn은 번들과 배포 비용 때문에 보류. 잡음 프로파일 표본 채취도 같은 이유로 보류
