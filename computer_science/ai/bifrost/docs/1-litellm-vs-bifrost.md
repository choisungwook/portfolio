# 같은 AI gateway인데 왜 Go로 다시 만들었나: LiteLLM과 Bifrost

LiteLLM track에서 gateway가 무슨 문제를 푸는지 다 배웠다. 그런데 채용 공고에 LiteLLM만 있는 게 아니다. Bifrost라는 이름이 점점 보인다. 둘 다 "OpenAI 호환 API 하나로 여러 모델을 감추는 gateway"라는 목적이 같은데, Bifrost는 Python이 아니라 Go로 짜였다. 이 문서는 왜 같은 도구를 다시 만들었는지, 그래서 언제 무엇을 고르는지 정리한다.

## 목적은 같고, 만든 이유는 성능이다

LiteLLM과 Bifrost는 하는 일이 겹친다. 여러 provider를 별칭 뒤에 감추고, virtual key로 인증·인가·한도를 걸고, 사용량을 기록한다. LiteLLM track에서 배운 개념이 Bifrost에도 거의 그대로 있다. 그래서 Bifrost를 처음부터 다시 배울 필요는 없다. 달라지는 지점만 보면 된다.

가장 큰 차이는 런타임이다. LiteLLM은 Python이고 Bifrost는 Go다. 이게 왜 중요한가. Python은 GIL(Global Interpreter Lock) 때문에 한 프로세스가 여러 CPU 코어로 요청을 진짜 병렬 처리하기 어렵다. gateway는 모든 LLM 트래픽이 지나는 병목이라, 이 한 지점의 처리량과 지연이 전체 시스템을 좌우한다. Bifrost는 Go의 goroutine으로 GIL 없이 동시성을 처리하려고 gateway를 다시 짠 것이다. 만든 이유가 기능이 아니라 성능인 셈이다.

## 벤치마크는 인상적이지만, 출처를 봐야 한다

Bifrost 진영(Maxim)이 공개한 벤치마크는 숫자가 크다. 같은 하드웨어에서 초당 5천 요청일 때 Bifrost가 요청당 약 11µs를 더하는 반면 LiteLLM은 훨씬 큰 오버헤드를 보이고, P99 지연은 수십 배 차이가 난다고 말한다. 메모리도 훨씬 적게 쓴다고 한다.

여기서 실무자는 바로 의심해야 한다. 이 숫자는 Bifrost를 만든 쪽이 공개한 것이다. 벤더가 자기 제품에 유리한 조건에서 잰 값일 수 있으니, 이걸 그대로 결론으로 삼지 않는다. 다만 방향성은 합리적이다. Go 런타임이 고동시성에서 Python보다 유리한 건 gateway가 아니어도 일반적으로 관찰되는 경향이다. 그래서 "Bifrost가 정확히 몇 배 빠르다"가 아니라 "고부하 구간에서 Go 기반이 유리할 수 있다"까지만 받아들이고, 실제 도입 전에는 내 트래픽으로 직접 재는 게 맞다.

## 운영에서 실제로 갈리는 지점

성능 숫자보다 실무에서 먼저 체감되는 건 운영 방식의 차이다.

| 항목 | LiteLLM | Bifrost |
|---|---|---|
| 런타임 | Python | Go |
| 상태 저장소 | Postgres 필요 | SQLite 내장(설정 스토어) |
| 설정 방식 | YAML + API | config.json(JSON) 또는 Web UI 또는 API |
| 기본 포트 | 4000 | 8080 |
| 배포 단위 | proxy + DB 컨테이너 | 단일 바이너리 컨테이너 |
| 거버넌스 | virtual key·team·budget | virtual key 중심 3계층(customer·team·VK) |
| 부가 | 넓은 provider·통합 생태계 | Web UI 대시보드, cluster mode, MCP gateway 내장 |

LiteLLM track에서 우리는 proxy와 Postgres를 한 쌍으로 띄웠다. Bifrost는 SQLite를 내장해 단일 컨테이너로 뜬다. 폐쇄망처럼 의존 컴포넌트를 줄이고 싶은 환경에서 이 차이가 크게 다가온다. 반대로 LiteLLM은 더 오래, 더 널리 쓰여서 provider 지원과 주변 통합, 레퍼런스가 풍부하다. 새 provider나 마이너한 기능을 먼저 지원하는 쪽은 보통 LiteLLM이다.

## 그래서 언제 무엇을 고르나

정답은 없고 맥락이 있다. 이 track의 목적도 "Bifrost가 낫다"를 주장하는 게 아니라, 골라 쓸 수 있게 두 도구의 결을 아는 것이다.

- 프로토타이핑, 빠른 실험, 최신 provider·기능이 급할 때: LiteLLM. Python 생태계와 넓은 지원이 앞선다.
- 트래픽이 커지고 gateway의 지연·처리량·메모리가 병목이 될 때, 의존 컴포넌트를 줄이고 단일 바이너리로 운영하고 싶을 때: Bifrost를 후보에 올린다.
- 실제로는 "LiteLLM으로 시작해 규모가 커지면 Bifrost를 검토"하는 경로가 흔하다. 두 gateway 모두 OpenAI 호환 API라, 애플리케이션 코드를 거의 그대로 두고 gateway만 바꿔 끼울 수 있다는 게 이 선택을 쉽게 만든다.

## 다음

말보다 직접 띄워 보는 게 빠르다. 먼저 Bifrost 로컬 환경을 올리는 [2-setup.md](2-setup.md)로 넘어간다. 환경이 뜨면 GPT·Gemini를 config.json으로 라우팅하는 [3-routing.md](3-routing.md)로 이어진다.

## 참고자료

- [Bifrost GitHub (maximhq/bifrost)](https://github.com/maximhq/bifrost)
- [Bifrost vs LiteLLM (Maxim 공개 벤치마크)](https://www.getmaxim.ai/bifrost/resources/benchmarks) — 벤더 공개 자료
- [LiteLLM vs Bifrost: Python과 Go 비교 (DEV Community)](https://dev.to/hadil/litellm-vs-bifrost-comparing-python-and-go-for-production-llm-gateways-4dg5)
