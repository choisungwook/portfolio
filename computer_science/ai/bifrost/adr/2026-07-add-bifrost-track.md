---
type: Decision
title: AI gateway 학습에 Bifrost track을 LiteLLM과 별도로 추가한다
description: LiteLLM과 목적이 같은 Go 기반 gateway Bifrost를 같은 workspace에 별도 track으로 두고, 폐쇄망 인프라는 재사용한다.
tags: [ai, bifrost, litellm, ai-gateway]
timestamp: 2026-07-11T00:00:00Z
---

## 결정

LiteLLM workspace에 Bifrost 학습 track을 `bifrost/` 하위에 별도로 추가한다.

- 문서를 두 track으로 분리한다: LiteLLM은 `docs/`, Bifrost는 `bifrost/docs/`. Bifrost track의 첫 문서는 LiteLLM과의 비교로 시작한다.
- Bifrost 실습 환경은 `bifrost/docker/`에 config.json 기반으로 둔다. LiteLLM과 달리 SQLite 내장이라 DB 컨테이너가 없다.
- 폐쇄망 Terraform은 새로 만들지 않고 LiteLLM track의 `terraform/`를 재사용한다. gateway가 바뀌어도 VPC·endpoint·EC2·Bedrock IAM은 동일하기 때문이다.

## 이유

- 엔터프라이즈 job description에 LiteLLM과 Bifrost가 함께 등장한다. 둘 다 OpenAI 호환 gateway라 개념이 겹치므로, Bifrost를 처음부터 다시 배우는 대신 LiteLLM에서 배운 개념 위에 "달라지는 지점"만 얹는 구성이 학습 효율이 높다.
- Bifrost는 Python이 아니라 Go로 만들어졌다. 만든 동기가 기능이 아니라 gateway 병목의 성능(GIL 회피, 저지연·저메모리)이다. 벤더가 공개한 벤치마크 숫자는 크지만 벤더 자료이므로, 방향성(고부하에서 Go가 유리할 수 있음)까지만 받아들이고 도입 전 직접 측정을 권한다.
- 폐쇄망 요구는 gateway 종류와 무관하다. 인프라를 복제하면 유지보수가 두 배가 되고 "gateway는 갈아 끼워도 폐쇄망 설계는 같다"는 교육 메시지도 흐려진다. 그래서 인프라는 공유하고 컨테이너 이미지와 config만 바꾼다.

## 검증에서 확인한 Bifrost 제약

- virtual key의 `value`는 `sk-bf-` 접두사가 있어야 그대로 쓰인다. 없으면 Bifrost가 새 key를 생성한다.
- governance의 budget·rate limit은 virtual key를 참조하므로 virtual key가 먼저 생성돼야 한다. `env.` 참조 값이 컨테이너에 전달되지 않으면 virtual key가 스킵되고 budget 생성이 FOREIGN KEY 제약으로 실패해 부팅이 죽는다.
- 클라이언트는 virtual key를 `x-bf-vk` 헤더 또는 `Authorization: Bearer`로 보낸다. 없는 key는 provider 도달 전에 `401 virtual_key_not_found`로 거부된다.

## Citations

1. Bifrost GitHub: <https://github.com/maximhq/bifrost>
2. Bifrost governance config: <https://docs.getbifrost.ai/deployment-guides/config-json/governance>
3. Bifrost vs LiteLLM (Maxim 공개 벤치마크): <https://www.getmaxim.ai/bifrost/resources/benchmarks>
