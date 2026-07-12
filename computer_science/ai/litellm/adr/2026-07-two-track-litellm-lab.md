---
type: Decision
title: LiteLLM 실습 환경을 로컬 docker compose와 폐쇄망 Terraform 두 트랙으로 나눈다
description: 학습용 로컬 환경은 docker compose로 GPT·Gemini를 라우팅하고, 엔터프라이즈 폐쇄망 조건은 Terraform private subnet + Bedrock으로 별도 재현한다.
tags: [ai, litellm, docker, terraform, aws]
timestamp: 2026-07-11T00:00:00Z
---

## 결정

LiteLLM 실습 환경을 두 트랙으로 나눈다.

- Track A (로컬): docker compose로 LiteLLM proxy + Postgres를 띄우고 GPT(OpenAI)와 Gemini를 라우팅한다. 라우팅·fallback, virtual key 인증/인가, token rate limit, spend 추적, guardrail 실습은 전부 여기서 한다.
- Track B (폐쇄망): Terraform으로 NAT gateway도 없는 완전 폐쇄 private subnet과 EC2를 만들고, LLM은 bedrock-runtime VPC endpoint를 통한 Bedrock만 라우팅한다.

## 이유

- 2026년 5월 기준 엔터프라이즈가 AI 도입 시 가장 먼저 찾는 것이 AI gateway이고, 요구 기능(audit, model 다중 선택, 인증/인가, guardrail, token rate limit, 폐쇄망 구축)은 대부분 LiteLLM 설정만으로 실험할 수 있다. 이 실험에 AWS 인프라는 필요 없으므로 빠르고 비용이 없는 docker compose가 학습에 적합하다.
- GPT와 Gemini는 SaaS API라 인터넷이 반드시 필요하다. 인터넷이 안 되는 엔터프라이즈 조건에서는 이 둘을 쓸 수 없고, VPC endpoint로 VPC 내부에서 도달할 수 있는 LLM은 Bedrock이 사실상 유일하다. 그래서 폐쇄망 트랙은 모델을 Bedrock으로 바꾸는 것이 조건을 지키는 선택이다.
- 두 트랙이 같은 LiteLLM config 구조와 같은 OpenAI 호환 API를 쓰므로, 학습자는 "gateway 설정은 그대로 두고 뒤의 모델과 네트워크만 바뀐다"는 AI gateway의 핵심 가치를 두 트랙의 대비로 체감한다.

## Citations

1. LiteLLM proxy 문서: <https://docs.litellm.ai/docs/proxy/quick_start>
2. Amazon Bedrock VPC endpoint(AWS PrivateLink): <https://docs.aws.amazon.com/bedrock/latest/userguide/usingVPC.html>
