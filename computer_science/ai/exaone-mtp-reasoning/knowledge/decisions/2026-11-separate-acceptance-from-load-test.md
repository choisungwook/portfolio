---
type: Decision
title: MTP 수용률은 자연 프롬프트로, 부하는 합성 데이터와 Mooncake replay로 따로 잰다
description: Mooncake trace와 synthetic_text에는 의미 있는 텍스트가 없어 MTP 수용률 측정에 쓰지 않는다
tags: [mtp, speculative-decoding, guidellm, mooncake, benchmark]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-22T11:00:00Z }
sources:
  - id: guidellm-replay
    resource: https://github.com/vllm-project/guidellm/blob/main/docs/en/guides/trace_replay.md
    title: GuideLLM trace replay 문서
  - id: mtp-blog
    resource: https://blog.gnu.or.kr/posts/exaone45-mtp-non-thinking/
    title: EXAONE 4.5 MTP 비추론 실험
---

# MTP 수용률은 자연 프롬프트로, 부하는 합성 데이터와 Mooncake replay로 따로 잰다

## 결정

MTP on/off 비교에서 수용률은 자연 프롬프트 파일(`data/natural-prompts.jsonl`)을 `ignore_eos=false`, synchronous profile로 보내 측정한다. 동시성과 도착 패턴에 따른 지연은 `synthetic_text` sweep과 Mooncake replay로 측정하고, 이 두 측정에서 나온 수용률은 판단에 쓰지 않는다.

## 이유

- Mooncake trace는 `timestamp`, `input_length`, `output_length`, `hash_ids`만 담고, GuideLLM이 길이에 맞춰 프롬프트 토큰을 합성한다[^guidellm-replay]. 합성 프롬프트의 답변은 실제 질문의 답변과 분포가 달라 MTP 헤드의 적중률도 다르다.
- GuideLLM은 출력 길이를 지정하면 `ignore_eos: true`를 기본으로 보낸다(0.8.1, mock 서버 요청 body로 확인). EOS 뒤에 억지로 생성한 토큰은 수용률을 왜곡한다.
- EXAONE 4.5의 수용률은 reasoning on 28.3%, off 0.8%로 요청 모드에 따라 크게 갈린다[^mtp-blog]. 수용률이 판단의 핵심이라 측정 데이터가 실제 텍스트여야 한다.

관련 문서: [3. 비교 테스트 설계](../../docs/3-benchmark-design.md)
