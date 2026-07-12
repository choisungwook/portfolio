# Bifrost 학습 핸즈온 — agent 맥락

이 파일은 이 워크스페이스(`computer_science/ai/bifrost`)에서 작업하는 agent를 위한 맥락이다. 저장소 전체 규칙은 루트 [AGENTS.md](../../../AGENTS.md)를 따른다. 옆 [../litellm/](../litellm/) 워크스페이스와 형제 관계이고, AI gateway 개념과 폐쇄망 인프라를 그쪽과 공유한다.

## 목적

LiteLLM을 배운 사람이 Go 기반 고성능 대안인 Bifrost로 넘어가도록, "달라지는 지점"만 짚는 학습이다. 라우팅·거버넌스는 로컬 docker에서 다루고, 폐쇄망은 LiteLLM 워크스페이스의 Terraform을 재사용한다.

## 현재 상태

구현 완료. `docker compose up`으로 실제 기동 확인했다.

- config.json의 openai·gemini provider 로드, `/v1/models`·Web UI(8080) 응답 확인.
- governance 블록(virtual_keys·budgets·rate_limits) 부팅 로드, virtual key 인가 실측: 틀린 key → `401 virtual_key_not_found`(provider 도달 전 차단), `x-bf-vk`·`Authorization: Bearer` 둘 다 허용.
- 실제 provider 호출과 폐쇄망 Bedrock 호출은 provider key·AWS 과금이 필요해 미검증.

## 구조

- `docs/1~5` — 커리큘럼. 1편은 LiteLLM 비교. akbun 설득식 스타일. 로컬 실습 환경은 `2-setup.md`로 분리하고 내용 문서는 링크만 건다(폐쇄망 환경은 [../litellm/docs/6-setup.md](../litellm/docs/6-setup.md) 재사용)
- `docker/` — Bifrost 실습: docker-compose.yaml, config.json, .env.example. SQLite 내장 단일 컨테이너
- `adr/` — 의사결정 기록 (OKF Decision 형식)

폐쇄망 Terraform은 이 워크스페이스에 없다. [../litellm/terraform/](../litellm/terraform/)를 공용으로 쓴다.

## ADR (결정 - 이유)

- 결정: Bifrost track을 LiteLLM과 별도 워크스페이스로 두고 폐쇄망 인프라는 재사용한다. / 이유: 두 gateway는 목적이 같아 개념 위에 차이만 얹으면 되고, 폐쇄망 요구는 gateway와 무관해 인프라 복제가 낭비다. → [adr/2026-07-add-bifrost-track.md](adr/2026-07-add-bifrost-track.md)

## agent가 알아야 할 제약 (검증됨)

- virtual key의 `value`는 `sk-bf-` 접두사가 있어야 그대로 쓰인다. 없으면 Bifrost가 새 key를 생성한다.
- governance의 budget·rate limit은 virtual key를 참조하므로 virtual key가 먼저 만들어져야 한다. `env.` 참조 값이 컨테이너에 전달되지 않으면 virtual key가 스킵되고 budget 생성이 FOREIGN KEY 제약으로 실패해 부팅이 죽는다.
- 클라이언트는 virtual key를 `x-bf-vk` 헤더 또는 `Authorization: Bearer`로 보낸다.
- 요청 모델명은 `provider/model` 형식이다(예: `gemini/gemini-2.0-flash`).
- API key(.env)는 커밋하지 않는다. `.env.example`만 둔다.
- commit·push·PR·Issue는 사용자가 명시적으로 지시할 때만 한다.

## 미완 작업

- `docs/3-routing.md`에 `todo-generate-image` 마커와 Bifrost 요청 흐름 이미지 프롬프트가 있다. 이미지 모델로 그림을 만들어 `imgs/`에 넣고 마커·프롬프트 블록을 이미지 링크로 교체해야 한다. 프롬프트는 akbun-draw-network-relationship 스타일이다.

## 수정 시 주의

- 폐쇄망 Terraform을 이 워크스페이스로 복제하지 않는다. LiteLLM 워크스페이스의 것을 재사용하는 것이 결정 사항이다.
- 새 의사결정은 adr/에 OKF Decision 형식으로 추가하고 이 파일의 ADR 절에 한 줄 요약을 더한다.
