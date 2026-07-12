# 실제 client를 코드 수정 없이 gateway에 붙인다

gateway를 다 만들었으니 이제 진짜 client를 붙인다. 핵심은 client 코드를 바꾸지 않고 base URL과 key만 gateway로 돌리는 것이다. 그러면 앞에서 건 인증·한도·감사·라우팅이 이 client의 트래픽에도 그대로 적용된다. 이 문서는 python(openai SDK)과 Codex CLI 두 가지를 gateway에 연결한다. 두 방식 모두 기존 설정을 건드리지 않게 격리하고, 실습이 끝나면 원상복구하는 법까지 정리한다. 실습 환경은 [2-setup.md](2-setup.md)에서 띄운 gateway를 쓴다.

## 붙일 key부터 준비한다

client에는 master key가 아니라 virtual key를 준다. master key는 관리자 열쇠라 client에 쥐여주면 안 된다. [4-auth-rate-limit.md](4-auth-rate-limit.md)나 [5-team-user.md](5-team-user.md), [7-web-ui.md](7-web-ui.md)에서 발급한 key 하나를 환경변수에 담아 둔다. 아래 두 실습은 모두 이 `LITELLM_KEY`를 읽는다.

```bash
export LITELLM_KEY=sk-...   # 발급받은 virtual key
```

## python: openai SDK의 base_url만 바꾼다

openai SDK를 그대로 쓰되 `base_url`만 gateway로 돌린다. 예제 스크립트는 [clients/python-client.py](../clients/python-client.py)에 있다.

```python
import os

from openai import OpenAI

GATEWAY_URL = "http://localhost:4000/v1"


def ask(prompt: str, model: str = "gpt") -> str:
  """gateway를 경유해 한 번 묻고 응답 텍스트를 돌려준다."""
  client = OpenAI(base_url=GATEWAY_URL, api_key=os.environ["LITELLM_KEY"])
  response = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": prompt}],
  )
  return response.choices[0].message.content
```

`model`에 provider 이름이 아니라 gateway 별칭(`gpt`, `gemini`)을 넣는 게 요점이다. OpenAI SDK인데 OpenAI로 나가지 않고 gateway를 지난다. 실행은 uv로 openai 패키지만 임시로 붙여 돌린다.

```bash
cd clients
LITELLM_KEY=$LITELLM_KEY uv run --with openai python python-client.py
```

이 방식은 롤백이 필요 없다. openai SDK는 전역 설정 파일을 쓰지 않고 `base_url`을 호출 시점에 인자로 받기 때문이다. 스크립트를 지우면 그걸로 끝이다.

## Codex CLI: 설정을 격리해서 붙인다

Codex CLI는 `~/.codex/config.toml`을 읽는다. 여기에 gateway 설정을 바로 쓰면 평소 쓰던 Codex 설정을 덮어쓴다. 그래서 `CODEX_HOME`으로 임시 설정 디렉터리를 만들어 격리한다. Codex는 `CODEX_HOME`이 가리키는 디렉터리의 `config.toml`을 대신 읽으므로, 기존 `~/.codex`는 손대지 않는다.

gateway를 custom provider로 등록한 설정은 [clients/codex-config.toml](../clients/codex-config.toml)에 있다. Codex는 2026년부터 Responses API만 지원하므로(`wire_api = "responses"`), LiteLLM이 노출하는 `/v1/responses`로 붙인다. LiteLLM은 이 endpoint에서 `model_list`의 어떤 모델이든 받아 chat 호출로 브릿지한다.

```toml
model_provider = "litellm"
model = "gpt"                        # gateway 별칭. gemini로 바꾸면 Google로 나간다.

[model_providers.litellm]
name = "LiteLLM Gateway"
base_url = "http://localhost:4000/v1"
env_key = "LITELLM_KEY"              # 이 환경변수에서 virtual key를 읽는다
wire_api = "responses"
```

격리된 디렉터리로 설정을 복사하고 Codex를 실행한다.

```bash
export CODEX_HOME="$(pwd)/clients/.codex-litellm"
mkdir -p "$CODEX_HOME"
cp clients/codex-config.toml "$CODEX_HOME/config.toml"
codex exec "gateway를 경유해 응답하는지 한 문장으로 답해줘"
```

응답이 돌아오면 Codex의 트래픽이 gateway를 지난 것이다. gpt-4o-mini나 gemini-flash 같은 가벼운 모델은 Codex의 본격 코딩 에이전트 작업까지는 못 할 수 있지만, 이 실습의 목표는 그게 아니다. Codex가 부른 요청도 gateway의 스펜드 로그에 남고 rpm·예산 한도에 걸린다는 것 — 즉 client가 무엇이든 통제가 트래픽 경로에 있다는 것을 확인하는 게 목적이다. 실제 코딩에는 `model`을 더 강한 모델 별칭으로 바꿔 등록하면 된다.

## 실습 설정을 원상복구한다

python은 되돌릴 게 없다. Codex는 격리해 뒀으므로 환경변수만 풀고 임시 디렉터리를 지우면 끝난다.

```bash
unset CODEX_HOME LITELLM_KEY
rm -rf clients/.codex-litellm
```

`CODEX_HOME`을 풀면 Codex는 다시 `~/.codex/config.toml`, 즉 원래 쓰던 설정으로 돌아간다. 실습 동안 기존 설정은 한 번도 바뀌지 않았다. 격리 디렉터리는 [clients/.gitignore](../clients/.gitignore)로 커밋에서도 제외돼 있다.

## 왜 이게 gateway의 마무리인가

두 client 모두 코드나 기존 설정을 바꾸지 않고 base URL과 key만 gateway로 돌렸다. 그런데 그 순간 앞 문서에서 건 모든 통제가 이 client에 적용된다. Codex가 부른 것도 [6-audit-guardrails.md](6-audit-guardrails.md)의 스펜드 로그에 남고, [4-auth-rate-limit.md](4-auth-rate-limit.md)의 rpm 한도에 걸리고, 권한 밖 모델은 거부된다. gateway가 모든 LLM 트래픽의 단일 경로이기 때문이다. [1-why-ai-gateway.md](1-why-ai-gateway.md)에서 말한 "뒤를 감추고 한 지점에서 통제한다"가 실제 client로 완성되는 지점이 여기다.

## 다음

여기까지가 로컬에서 gateway를 만지는 Track A다. 이제 이 gateway를 인터넷이 안 되는 폐쇄망에 올리고 모델을 Bedrock으로 바꾼다. 폐쇄망 환경을 만드는 [9-setup.md](9-setup.md)로 넘어간다.
