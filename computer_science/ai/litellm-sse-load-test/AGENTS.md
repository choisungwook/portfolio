# LiteLLM Chat SSE 부하테스트 핸즈온

LiteLLM Proxy(`v1.110.2`)와 로컬 Ollama(`qwen2.5:1.5b`) 환경에서 일반 HTTP와 SSE의 차이, 기본 `k6/http`로 Chat SSE를 부하테스트할 때 발생하는 지표 왜곡, `xk6-sse` 보완과 LLM 전용 벤치마크 도구(AIPerf, GuideLLM) 비교를 실험하는 핸즈온이다.

@../../../AGENTS.md

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
