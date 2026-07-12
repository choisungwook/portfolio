# GPT와 Gemini를 코드 한 줄 안 고치고 바꿔 끼우기

애플리케이션은 gateway의 endpoint 하나만 안다. `model` 필드에 `gpt`라고 쓰면 OpenAI로, `gemini`라고 쓰면 Google로 나간다. 그리고 GPT가 죽으면 자동으로 Gemini가 받는다. 이 문서는 그 라우팅과 fallback을 직접 확인한다. 실습 환경은 [2-setup.md](2-setup.md)에서 먼저 띄워 둔다.

## 별칭 뒤에 provider를 숨긴다

라우팅의 뼈대는 [set-model/config.yaml](../install/set-model/config.yaml)의 `model_list`다. 학습자가 부르는 이름(`model_name`)과 실제 provider 모델(`litellm_params.model`)을 분리하는 게 핵심이다.

```yaml
model_list:
  - model_name: gpt            # 애플리케이션이 부르는 별칭
    litellm_params:
      model: openai/gpt-4o-mini # 실제로 나가는 provider 모델
      api_key: os.environ/OPENAI_API_KEY
  - model_name: gemini
    litellm_params:
      model: gemini/gemini-2.0-flash
      api_key: os.environ/GEMINI_API_KEY
```

이 분리가 왜 중요한가. 나중에 GPT를 더 싼 모델로 바꾸거나 Gemini로 완전히 옮겨도, `litellm_params.model` 한 줄만 고치면 된다. 애플리케이션은 여전히 `gpt`를 부른다. gateway가 없으면 이 변경이 모든 애플리케이션의 코드 수정이 된다. 모델 이름은 실습 시점에 각 provider가 지원하는 최신 안정 모델로 바꿔도 된다.

## 같은 endpoint, 다른 모델

별칭만 바꿔 두 provider를 부른다. 요청 형식은 OpenAI Chat Completions 그대로다. 인증에는 관리자 key인 master key를 쓴다(virtual key는 [4-auth-rate-limit.md](4-auth-rate-limit.md)에서 발급한다).

```bash
# GPT로 나가는 요청
curl -s http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt", "messages": [{"role": "user", "content": "한 문장으로 자기소개"}]}'
```

`model`을 `gemini`로만 바꾸면 응답이 Google에서 온다. 애플리케이션 코드에서 달라지는 건 문자열 하나뿐이다. 이게 gateway가 파는 가치의 가장 단순한 형태다.

## GPT가 죽으면 Gemini가 받는다

여기서 실무자는 바로 묻는다. "provider 하나가 장애가 나면?" 그래서 model 다중 선택의 진짜 이유는 취향이 아니라 장애 대응이다. config.yaml의 `router_settings.fallbacks`가 이걸 처리한다.

```yaml
router_settings:
  fallbacks: [{ "gpt": ["gemini"] }]  # gpt 호출이 실패하면 gemini로 넘긴다
```

동작을 눈으로 보려면 GPT를 일부러 죽이면 된다. `.env`의 `OPENAI_API_KEY`를 잘못된 값으로 바꾸고 [2-setup.md](2-setup.md)의 기동 명령으로 다시 띄운 뒤, `model: gpt`로 요청한다. OpenAI 인증이 실패하지만 응답은 Gemini에서 돌아온다. 응답 본문의 모델 정보나 `docker compose logs litellm`의 fallback 로그로 넘어간 것을 확인할 수 있다.

실험이 끝나면 key를 원래대로 돌려놓는다. fallback을 확인했으면 이제 이 endpoint에 아무나 접근하지 못하게 막을 차례다.

## 다음

master key는 관리자 열쇠라 애플리케이션에 그대로 주면 안 된다. key를 발급하고 한도를 거는 [4-auth-rate-limit.md](4-auth-rate-limit.md)로 넘어간다.
