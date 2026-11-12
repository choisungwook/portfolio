---
type: Decision
title: emulator는 Docker aarch64 이미지로, 실제 AWS 비교는 용도에 따라 두 리전으로 한다
description: macOS에서 emulator를 띄우는 방식과 실제 AWS 비교 리전을 고른 이유
tags: [aws-emulator, docker, aws]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-12T08:00:00Z }
sources:
  - id: docker-guide
    resource: https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-docker.html
    title: Getting started with Docker
  - id: limits
    resource: https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html#what-is-limits
    title: AWS Emulator limitations
---

## 결정

- emulator는 공식 Dockerfile의 RPM을 `aws-emulator-aarch64.rpm`으로 바꿔 직접 빌드한다(`docker/Dockerfile`).
- 오류 fidelity와 한계 비교는 `us-west-2`, 속도 비교는 `ap-northeast-2`에서 실제 AWS를 호출한다.
- evaluation suite 러너는 실행하지 않고, release 자산 `scores.json.gz`를 읽어 분석한다.

## 이유

- AWS는 이미지를 배포하지 않고 macOS용 패키지도 없다[^docker-guide]. Apple silicon에서 x86 RPM은 에뮬레이션으로 느려진다.
- fidelity test는 `us-west-2`에서 검증한다[^limits]. 오류와 동작 비교는 같은 리전이어야 공정하다. 속도는 한국에서 `us-west-2` 왕복 지연(19.29초)이 섞이므로 서울 리전(10.2초)으로 쟀다.
- 러너는 `checks` extra로 aws-cdk-lib 등 큰 패키지를 설치하고 외부 저장소 코드를 실행한다. 로컬 디스크 여유가 1GB 안팎이었고, agent 실행 환경의 auto mode 분류기도 이 동작을 막았다. 점수 파일만으로 서비스별 통과율과 실패 operation을 볼 수 있었다.
