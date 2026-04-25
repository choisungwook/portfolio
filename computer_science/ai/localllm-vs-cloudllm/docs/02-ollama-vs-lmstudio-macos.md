# macOS에서 ollama와 LM Studio 비교 (2026년 4월 기준)

저는 macOS에서 localllm을 돌릴 때 ollama와 LM Studio 둘 다 써봤습니다. 처음에는 CLI만 있는 ollama가 깔끔해 보여서 그쪽으로 시작했는데, 결국엔 LM Studio로 옮겨갔습니다. 이 글은 두 도구를 비교한 뒤 제가 왜 LM Studio를 골랐는지를 정리한 글입니다. 2026년 4월 기준입니다.

## 두 도구의 정체성

저는 ollama를 처음 알았을 때 `ollama run llama3` 한 줄에 모델이 떠서 놀랐습니다. LM Studio는 그 반대였습니다. 처음 dmg를 받아 앱을 띄웠을 때 GUI가 너무 친절해서 "이걸 CLI로도 쓸 수 있나?"라는 의문이 먼저 들었습니다. 두 도구의 첫 인상이 정반대였다는 게 비교의 출발점입니다.

**ollama**는 CLI 중심의 오픈소스 도구입니다. `ollama run llama3` 한 줄이면 모델을 받고 채팅을 시작할 수 있습니다. 모델은 ollama가 운영하는 자체 registry에서 받아옵니다. macOS, Linux, Windows에서 모두 동작합니다.

**LM Studio**는 GUI 중심으로 시작된 데스크톱 앱입니다. 다만 2025년부터 `lms`라는 CLI를 별도로 제공하기 시작했고, 지금은 CLI만으로도 거의 모든 작업을 할 수 있습니다. 모델은 Hugging Face에서 직접 검색해서 받습니다. 라이선스는 개인 사용은 무료, 상업 사용은 별도 약관입니다.

## 설치 방식

ollama는 homebrew로 설치하거나 공식 사이트의 설치 스크립트를 받아서 씁니다.

```sh
brew install ollama
```

LM Studio는 공식 사이트에서 dmg 파일을 받아 설치하는 방식이 기본입니다. 앱을 한 번 실행해두면 그 안에 `lms` CLI가 같이 깔려 있고, `~/.lmstudio/bin/lms` 경로에 있습니다. 저는 PATH에 추가해서 쓰고 있습니다.

설치 자체는 ollama가 더 가볍습니다. ollama는 단일 바이너리고, LM Studio는 GUI 앱까지 포함된 패키지라 디스크를 더 차지합니다. 정확한 디스크 크기는 따로 측정해보지 않았고, 체감만 적었습니다.

## 모델 카탈로그

이 부분에서 두 도구의 철학 차이가 가장 크게 드러납니다.

ollama는 자체 모델 registry(`ollama.com/library`)에서 큐레이션된 모델만 받습니다. 제가 처음 ollama를 썼을 때는 이게 편했습니다. 모델 이름만 알면 받을 수 있고, 검증된 quantization이 기본으로 들어옵니다. 다만 신규 모델이 registry에 등록되기까지 시간이 걸리고, registry에 없는 변형은 직접 Modelfile을 작성해야 합니다.

LM Studio는 Hugging Face의 GGUF 포맷 모델을 직접 검색합니다. 새로 나온 모델이 Hugging Face에 올라온 그날부터 받을 수 있고, 같은 모델의 quantization 변형(Q4, Q5, Q8 등)도 골라서 받습니다. 저는 새 모델을 빨리 만져보고 싶을 때 이게 결정적이었습니다.

## CLI 사용감

ollama의 CLI는 작지만 단단합니다.

```sh
ollama run gemma3:270m
```

이 한 줄로 모델을 받고 채팅 세션이 시작됩니다. 명령어 종류가 적어서 외울 게 거의 없습니다.

LM Studio의 `lms` CLI는 명령어가 더 많고 세분화되어 있습니다.

```sh
lms ls                  # 받아둔 모델 목록
lms get <model>         # 모델 다운로드
lms load <model>        # 모델을 메모리에 로드
lms server start        # OpenAI 호환 서버 시작
lms server status       # 서버 상태 확인
```

처음에는 명령어가 많아서 ollama보다 복잡해 보였는데, 익숙해지고 나니 "다운로드", "로드", "서버" 단계가 명확하게 나뉘어 있는 게 오히려 마음에 들었습니다. 디버깅할 때 어느 단계에서 막혔는지 추적하기 좋았습니다.

## API 서버

둘 다 OpenAI 호환 엔드포인트를 제공합니다. 즉 `openai` SDK를 쓰는 코드를 거의 그대로 붙일 수 있습니다.

차이는 **Anthropic 호환 엔드포인트**에서 생깁니다. LM Studio는 `/v1/messages` 경로로 Anthropic API와 호환되는 엔드포인트를 제공합니다. 이 덕분에 Claude Code 같은 Anthropic 클라이언트를 별도 proxy 없이 LM Studio로 바로 붙일 수 있습니다. ollama는 2026년 4월 기준 Anthropic 호환 엔드포인트를 기본 제공하지 않아서, Claude Code를 붙이려면 별도 proxy(예: claude-code-router)를 거쳐야 합니다.

저에게는 이 차이가 결정적이었습니다. 저는 Claude Code를 매일 쓰는데, proxy를 한 단계 더 두는 게 디버깅 포인트를 늘리는 일이라 피하고 싶었습니다.

## 자원 사용

체감상 LM Studio가 약간 더 무겁습니다. GUI 앱이 백그라운드에서 떠 있기 때문입니다. CLI만 쓰더라도 LM Studio 앱 프로세스가 돌고 있어야 하는 시점이 있어서, 메모리 사용량이 ollama보다 큽니다. 정확한 메모리 수치는 Activity Monitor로 측정해본 적이 없고, "더 공부할 것"에 적어두었습니다. M 시리즈 Mac에서는 체감상 무시할 수준이지만, 메모리가 빠듯한 환경이라면 ollama가 더 가볍습니다.

## 한눈에 비교

| 항목 | ollama | LM Studio |
|---|---|---|
| 라이선스 | 오픈소스 | 개인 무료 / 상업 별도 약관 |
| 인터페이스 | CLI 중심 | GUI + CLI(`lms`) |
| 모델 카탈로그 | 자체 registry | Hugging Face 직접 |
| 신규 모델 반영 속도 | registry 등록 후 | Hugging Face 업로드 즉시 |
| OpenAI 호환 API | 지원 | 지원 |
| Anthropic 호환 API | 미지원 (proxy 필요) | 지원 (`/v1/messages`) |
| 메모리 사용량 | 가벼움 | GUI 앱 포함으로 더 무거움 |
| 설치 | `brew install ollama` | dmg 다운로드 |

## 그래서 저는 LM Studio를 골랐습니다

저의 선택 기준은 두 가지였습니다. 첫째, **새 모델을 빨리 만져보고 싶다**. Hugging Face 직접 검색이 가능한 LM Studio가 유리했습니다. 둘째, **Claude Code를 proxy 없이 붙이고 싶다**. Anthropic 호환 엔드포인트가 결정적이었습니다.

다만 이 선택이 모두에게 맞는 건 아닙니다. 사용 케이스가 다음과 같다면 ollama가 더 잘 맞습니다.

- 메모리가 빠듯한 환경이거나, GUI 앱이 부담스러운 서버 환경
- OpenAI 호환 API만 쓰면 충분한 경우
- 검증된 모델만 안정적으로 돌리고 싶은 경우

저는 두 도구를 모두 가지고 있고, 회사 업무는 LM Studio + Claude Code, 빠른 실험은 ollama로 나눠 쓰고 있습니다. 도구는 하나로 통일해야 한다고 생각하지 않습니다.

## 더 공부할 것

- LM Studio의 `lms server` 와 ollama의 `ollama serve` 가 동시에 떠 있을 때 포트 충돌과 메모리 사용량을 실측한 데이터는 아직 없습니다.
- Hugging Face에서 받은 GGUF 파일이 ollama의 Modelfile로도 깔끔하게 import되는지, quantization별로 차이가 있는지 비교해보고 싶습니다.

## 참고자료

- LM Studio 공식 사이트: <https://lmstudio.ai/>
- LM Studio CLI(`lms`) 문서: <https://lmstudio.ai/docs/cli>
- ollama 공식 사이트: <https://ollama.com/>
- ollama model library: <https://ollama.com/library>
- Hugging Face GGUF 모델: <https://huggingface.co/models?library=gguf>
