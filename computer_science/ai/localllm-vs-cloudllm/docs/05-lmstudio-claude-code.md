# LM Studio를 Claude Code에 붙이기

저는 Claude Code를 매일 쓰는데, 회사 코드를 다룰 때는 외부 API에 보낼 수 없어서 cloudllm을 못 씁니다. 그래서 LM Studio로 띄운 로컬 모델을 Claude Code에 직접 붙여 쓰기로 했습니다. LM Studio가 Anthropic 호환 엔드포인트를 제공하기 때문에 별도 proxy가 필요 없었습니다. 이 글은 그 연결 과정을 정리한 글입니다. 2026년 4월 기준입니다.

## 검증 노트

이 글의 명령어 흐름은 LM Studio 공식 문서(<https://lmstudio.ai/docs/integrations/claude-code>)를 기반으로 정리했습니다. 본문에 "공식 문서에 따르면"이라고 표시된 부분은 제가 직접 돌려본 게 아니라 문서 인용입니다. `<!-- 검증: 사용자 -->` 표시는 제가 명령어를 실행한 뒤 출력 예시를 채울 자리입니다. 실제 출력을 채우기 전까지는 "흐름은 맞지만 출력은 미검증"인 상태로 봐주시면 됩니다.

## 사전 준비

- LM Studio 설치와 `lms` CLI 동작 확인 ([04-lmstudio-handson.md](./04-lmstudio-handson.md))
- Claude Code CLI 설치
- 모델 다운로드 (저는 Gemma 4 E2B로 시작했습니다)

## 1. LM Studio 서버 시작

먼저 LM Studio 서버를 띄웁니다. 기본 포트는 1234입니다.

```sh
lms server start --port 1234
```

서버가 떴는지 확인.

```sh
lms server status
```

<!-- 검증: 사용자 - lms server status 출력 결과 -->

## 2. 모델 로드

Claude Code가 호출할 모델을 메모리에 올려둡니다.

```sh
lms load google/gemma-3n-e2b-it-GGUF
```

<!-- 검증: 사용자 - lms ps 출력 결과 -->

## 3. Claude Code 환경변수 설정

LM Studio 공식 문서의 안내대로 환경변수 두 개를 설정합니다. Claude Code는 이 두 변수를 보고 호출 대상을 결정합니다.

```sh
export ANTHROPIC_BASE_URL=http://localhost:1234
export ANTHROPIC_AUTH_TOKEN=lmstudio
```

`ANTHROPIC_BASE_URL`은 호출할 엔드포인트, `ANTHROPIC_AUTH_TOKEN`은 인증 토큰입니다. 공식 문서 예시에서는 인증을 따로 켜지 않은 경우 토큰 값으로 `lmstudio`라는 임의 문자열을 그대로 사용합니다. 저도 같은 값을 쓰고 있습니다.

저는 매번 export하기 귀찮아서 별도 셸 함수로 묶어두고 씁니다.

```sh
function claude-local() {
  ANTHROPIC_BASE_URL=http://localhost:1234 \
  ANTHROPIC_AUTH_TOKEN=lmstudio \
  claude "$@"
}
```

이렇게 해두면 회사 코드에서는 `claude-local`, 그 외에는 그냥 `claude`로 나눠 쓸 수 있습니다.

## 4. Claude Code 실행

모델 이름을 명시해서 Claude Code를 띄웁니다.

```sh
claude --model google/gemma-3n-e2b-it-GGUF
```

<!-- 검증: 사용자 - claude 실행 결과 화면 -->

LM Studio 앱의 Developer 탭에서 요청이 들어왔는지 같이 확인하면 좋습니다.

## 5. 가장 먼저 부딪히는 한계: tool use

여기서부터 솔직한 이야기를 해야겠습니다. 저는 Gemma 4 E2B로 위 과정을 마치고 Claude Code에서 "이 디렉터리 파일을 읽어줘"라고 물어봤을 때 모델이 **tool을 호출하지 못했습니다**. Claude Code는 파일을 읽고 쓰고 bash를 실행하는 모든 작업을 tool use(function calling)로 처리하는데, 작은 모델은 이 능력이 사실상 없거나 매우 약합니다.

LM Studio 공식 문서도 권장 모델로 **"~25k+ context length를 지원하면서 tool use가 가능한 모델"**을 명시하고 있고, 예시로는 `gpt-oss-20b`처럼 20B급 모델을 듭니다.

저의 경험을 정리하면 이렇습니다.

| 모델 | 동작 여부 | 검증 출처 |
|---|---|---|
| Gemma 3 270M | 텍스트 응답은 되지만 tool 호출은 거의 안 됨 | 직접 시도 예정 |
| Gemma 4 E2B (2B) | 단순 텍스트 응답 위주, tool 호출은 불안정 | 직접 시도 예정 |
| `gpt-oss-20b` 급 (20B 이상) | tool 호출 동작 | LM Studio 공식 문서 권장 (제가 돌려보진 못함) |

저는 작은 모델로 우선 "Claude Code가 LM Studio를 호출하긴 한다"는 사실을 확인하는 데 의의를 두었습니다. 실제 코딩 보조로 쓰려면 더 큰 모델로 올라가야 합니다.

## 6. 인증을 활성화한 경우

저는 인증 없이 쓰고 있어서 이 부분은 직접 시도해보지 못했습니다. 공식 문서에 따르면 LM Studio에서 "Require Authentication"을 켰을 때는 토큰을 별도로 발급받아 환경변수에 넣어야 합니다.

```sh
export LM_API_TOKEN=<LMSTUDIO_TOKEN>
export ANTHROPIC_AUTH_TOKEN=$LM_API_TOKEN
```

공식 문서에 따르면 LM Studio는 `x-api-key` 헤더와 `Authorization: Bearer <token>` 헤더 둘 다 받습니다. Claude Code는 후자를 사용합니다. 인증을 켜고 실제로 돌려보면 이 단락은 직접 시도한 결과로 갱신할 예정입니다.

## 7. 동작 확인 체크리스트

연결이 정상이면 아래가 모두 OK여야 합니다. 한 단계라도 막히면 그 단계부터 다시 확인합니다.

- [ ] `lms server status`가 running
- [ ] `lms ps`에 모델이 loaded로 표시
- [ ] `curl http://localhost:1234/v1/models` 가 모델 목록을 반환
- [ ] `claude --model <model-name>` 실행 시 채팅 화면이 뜸
- [ ] LM Studio Developer 탭에 요청 로그가 찍힘

## 그래서 이 조합을 어떻게 쓰고 있나

저는 작은 모델로는 단순 텍스트 질의응답(예: "이 코드의 의도를 한 문장으로 요약해줘")만 씁니다. 실제 파일 수정이나 bash 실행이 필요한 작업은 cloudllm 쪽 Claude Code로 옮겨갑니다. 회사 정책상 가능한 범위에서만 LM Studio 쪽으로 보냅니다.

조합의 가치는 "모든 작업을 localllm으로 한다"가 아니라 "어떤 작업은 localllm으로 옮길 수 있다"에 있다고 정리하고 있습니다. 더 큰 모델을 돌릴 환경(예: 사내 GPU 서버)이 생기면 이 비율이 바뀔 거라고 예상합니다.

## 더 공부할 것

- `gpt-oss-20b` 같은 20B급 모델을 띄워서 tool use가 실제로 어디까지 동작하는지 측정해보고 싶습니다.
- LM Studio가 Anthropic의 어떤 API 버전까지 호환하는지(예: prompt caching, extended thinking 등 신규 기능)는 아직 확인하지 못했습니다.

## 참고자료

- LM Studio + Claude Code 통합 문서: <https://lmstudio.ai/docs/integrations/claude-code>
- LM Studio API 서버 문서: <https://lmstudio.ai/docs/api>
- Anthropic API 개요: <https://docs.anthropic.com/en/api/overview>
- Claude Code CLI 문서: <https://docs.claude.com/en/docs/claude-code>
