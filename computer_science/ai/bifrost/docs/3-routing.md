# GPT·Gemini를 config.json 하나로 라우팅한다

호출하는 쪽 관점에서 Bifrost는 LiteLLM과 거의 같다. 둘 다 OpenAI 호환 `/v1/chat/completions`를 주고, 별칭 뒤에 provider를 감춘다. 다른 건 gateway 쪽 설정 형식(JSON)과 포트(8080)뿐이다. 이 문서는 config.json의 provider 등록과 호출을 다룬다. 실습 환경은 [2-setup.md](2-setup.md)에서 먼저 띄워 둔다.

## 구조: 별도 DB가 없다

LiteLLM track의 요청 흐름 그림과 딱 한 군데가 다르다. 별도 Postgres 대신 SQLite가 컨테이너 안에 들어 있어, 상태 저장용 화살표가 바깥 DB로 나가지 않는다.

todo-generate-image

```text
A horizontal hand-drawn whiteboard-style diagram showing how network traffic flows between
components, drawn with slightly wobbly marker lines on a clean white background, in a friendly
handwritten marker font. All text is in English.

TITLE: a short title at the top in handwritten marker font, reading exactly: "Bifrost Gateway Request Flow".

COMPONENTS:
- Application/actor components, drawn as plain rectangles with a dark (near-black) hand-drawn
  outline and white fill, each labeled inside: "App / SDK" (far left), and "OpenAI GPT",
  "Google Gemini" (far right).
- Network components (things that relay/route/proxy traffic), drawn as a rectangle with an ORANGE
  (#E8870C) hand-drawn outline, labeled inside: "Bifrost Proxy (Go, single binary)" (center).

GROUPS: draw a thin dark rectangle around the "Bifrost Proxy" box and a small box labeled
"embedded SQLite store" tucked inside it, showing the state store lives inside the gateway process
(no external database). Label the group box at the top: "single container".

FLOW (all arrows are BLACK and show traffic direction, left to right): an arrow from "App / SDK"
to "Bifrost Proxy"; from "Bifrost Proxy" a branching pair of arrows to "OpenAI GPT" and to
"Google Gemini" on the right.

CONNECTION LABELS: write these short labels in ORANGE text next to the arrow they describe:
"OpenAI-compatible :8080" on the App-to-Proxy arrow; "x-bf-vk / Bearer" below that same arrow;
"provider API key" on the arrows going to GPT and Gemini.

HIGHLIGHT (the key application-to-network path): keep all arrows black; draw a GREEN (#2FA84F)
rounded rectangle around the "App / SDK" to "Bifrost Proxy" entry, showing this single entrypoint
is where virtual-key auth, routing and governance are applied. Do not color any arrow green. Keep
the green to this one path so it stands out.

STYLE: clean, friendly hand-drawn whiteboard sketch, generous spacing, arrows and labels never
overlapping, very legible. 16:9 aspect ratio.

DO NOT: add any product logos or icons (components are labeled boxes only). No watermarks, no extra
UI chrome. Do not misspell the component names or labels. Do not let arrows or text overlap.
```

## provider를 config.json에 등록한다

LiteLLM의 `model_list`에 대응하는 것이 Bifrost의 `providers`다. [docker/config.json](../docker/config.json)에서 provider 아래에 key를 넣고, 그 key로 쓸 모델을 나열한다.

```json
{
  "$schema": "https://www.getbifrost.ai/schema",
  "providers": {
    "openai": {
      "keys": [
        { "name": "openai", "value": "env.OPENAI_API_KEY", "models": ["gpt-4o-mini"], "weight": 1.0 }
      ]
    },
    "gemini": {
      "keys": [
        { "name": "gemini", "value": "env.GEMINI_API_KEY", "models": ["gemini-2.0-flash"], "weight": 1.0 }
      ]
    }
  }
}
```

`value`의 `env.OPENAI_API_KEY`는 환경변수를 참조하라는 뜻이다. 자격증명을 파일에 직접 쓰지 않는다. `weight`는 같은 provider에 key가 여럿일 때 트래픽을 나누는 비율이라, key 하나면 의미가 없지만 부하 분산·다중 key로 확장할 자리다. 모델 이름은 실습 시점에 각 provider가 지원하는 값으로 바꿔도 된다.

## 같은 endpoint, 다른 모델

호출은 OpenAI 형식 그대로다. LiteLLM track과 다른 점은 포트(8080)와, 모델 이름을 `provider/model` 형태로 준다는 것이다.

```bash
# GPT로 나가는 요청
curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "한 문장으로 자기소개"}]}'
```

`model`을 `gemini/gemini-2.0-flash`로 바꾸면 Google에서 응답이 온다. LiteLLM에서 배운 "별칭 뒤에 provider를 감춘다"가 형식만 바뀌어 그대로 재현된다.

## 다음

지금은 아무나 이 endpoint를 부를 수 있다. Bifrost의 핵심인 virtual key로 인증·인가·한도를 거는 [4-governance.md](4-governance.md)로 넘어간다.
