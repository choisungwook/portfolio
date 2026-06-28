# Codex App과 Claude Code에서는 무엇을 수동 확인해야 할까

Codex App과 Claude Code는 모두 agent가 로컬 작업을 도와주는 도구입니다. 하지만 같은 "sandbox"라는 말을 써도 설정 위치, 승인 UI, 기본 권한은 다를 수 있습니다. 그러면 비교할 때 무엇을 맞춰야 할까요?

이 문서는 자동 스크립트만으로 끝내기 어려운 수동 확인 항목을 정리합니다.

## Codex App에서는 어디를 봐야 할까

Codex App은 앱 설정과 `config.toml` 계열 설정을 함께 봐야 합니다. 앱의 permissions selector에서 현재 모드가 무엇인지 확인하고, 고급 설정이 있으면 `config.toml`의 sandbox, approval, network 설정도 확인합니다.

수동 체크리스트:

| 항목 | 확인 값 |
|---|---|
| 현재 permissions mode | 확인 필요 |
| workspace root | 확인 필요 |
| writable root에 `/tmp`가 포함되는지 | 확인 필요 |
| network access가 켜져 있는지 | 확인 필요 |
| approval reviewer가 user인지 auto_review인지 | 확인 필요 |
| `.git`, `.codex`, `.agents` 보호 경로가 쓰기 차단되는지 | 확인 필요 |

실험 프롬프트:

```text
computer_science/ai/ai-agent-sandbox 에서 make check를 실행하고, blocked/allowed 결과와 승인 요청 항목을 표로 정리해줘.
```

## Claude Code에서는 무엇을 같은 형식으로 맞출까

Claude Code의 세부 sandbox 설정 명칭은 현재 로컬 설치와 정책에 따라 확인해야 합니다. 확인 필요. 다만 비교 형식은 Codex와 같게 둘 수 있습니다.

수동 체크리스트:

| 항목 | 확인 값 |
|---|---|
| 현재 권한 모드 또는 approval 모드 | 확인 필요 |
| workspace root | 확인 필요 |
| workspace 밖 쓰기 요청이 차단되는지 | 확인 필요 |
| 네트워크 요청이 승인 대상으로 올라오는지 | 확인 필요 |
| Git 명령 실행이 허용되는지 | 확인 필요 |
| 민감 파일 패턴을 deny할 수 있는지 | 확인 필요 |

같은 스크립트를 실행하게 하되, 결과 표는 도구 이름만 바꿔 같은 열로 기록합니다.

| 도구 | workspace write | outside write | network | approval 요청 | 비고 |
|---|---|---|---|---|---|
| Codex App | 확인 필요 | 확인 필요 | 확인 필요 | 확인 필요 | 앱 설정 포함 |
| Claude Code | 확인 필요 | 확인 필요 | 확인 필요 | 확인 필요 | 로컬 정책 확인 필요 |

## 왜 같은 명령보다 같은 질문이 중요할까

도구마다 UI와 설정 이름이 다르면 같은 명령을 완전히 같은 방식으로 실행하기 어렵습니다. 그래서 비교 기준은 명령어 문자열이 아니라 질문이어야 합니다.

- workspace 안 파일은 쓸 수 있는가?
- workspace 밖 파일 쓰기는 멈추는가?
- 네트워크 요청은 승인 대상인가?
- 승인 주체는 사람인가 자동 리뷰어인가?
- 민감 파일은 read deny로 막을 수 있는가?

이 질문을 같은 표로 기록하면 도구 차이를 과장하지 않고 볼 수 있습니다.

## 어떤 설정을 추천할 수 있을까

기본 추천은 workspace write와 on-request 계열 승인입니다. 장점은 agent가 일반적인 코드 수정과 테스트를 계속 진행할 수 있다는 점입니다. 단점은 네트워크, 외부 경로, Docker socket 같은 작업에서 승인이 자주 필요할 수 있다는 점입니다.

full access는 로컬 실험이 막힐 때 유혹적입니다. 장점은 설정 마찰이 적다는 점입니다. 단점은 실수나 prompt injection이 로컬 전체 권한으로 이어질 수 있다는 점입니다. 실습에서는 full access를 기본값으로 두지 않습니다.

정리하면, Codex App과 Claude Code 비교는 제품 이름을 맞추는 실험이 아니라 권한 질문을 같은 표로 맞추는 실험입니다. 설정 이름은 달라도 경계 질문은 같게 가져갈 수 있습니다.

## 참고자료

- [OpenAI Codex - App settings](https://developers.openai.com/codex/app/settings)
- [OpenAI Codex - Sandbox](https://developers.openai.com/codex/concepts/sandboxing)
- Claude Code sandbox 세부 문서: 확인 필요
