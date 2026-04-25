# LM Studio 설치와 CLI 핸즈온 (macOS)

저는 LM Studio를 GUI보다 CLI(`lms`)로 쓰는 걸 더 좋아합니다. 그런데 처음 설치할 때는 GUI로 한 번씩 확인하지 않으면 어디까지 진행됐는지 헷갈렸습니다. 이 글은 CLI 명령어를 한 줄씩 실행하면서 그 결과를 GUI로도 확인하는 방식으로 정리했습니다. 2026년 4월 기준입니다.

## 검증 노트

이 글은 명령어 흐름과 GUI 확인 포인트를 정리한 메모입니다. 본문에 보이는 `<!-- 검증: 사용자 -->` 표시는 제가 명령어를 실행한 뒤 출력 예시를 채울 자리입니다. Hugging Face 모델 ID(`google/gemma-3n-e2b-it-GGUF` 등)는 LM Studio 카탈로그의 실제 표기에 맞춰 이 시점에서 같이 보정합니다. 실제 출력과 정확한 모델 ID로 채우기 전까지는 "흐름은 맞지만 출력은 미검증"인 상태로 봐주시면 됩니다.

## 환경

- macOS (M 시리즈 권장)
- 디스크 여유: Gemma 3 270M Q4는 1GB 미만, 4B Q4는 약 2.5GB. 저는 여유로 5GB를 잡아두는 편입니다.
- LM Studio 0.3.x 이상

## 사용할 모델

저는 가장 작은 모델로 시작합니다. Google이 공식 문서(<https://ai.google.dev/gemma/docs/core>)에서 가장 작다고 표기한 변형이 **E2B**(2B 효율 매개변수)이고, 저는 이걸 우선 후보로 잡았습니다. LM Studio 카탈로그에 같은 모델이 없다면 Gemma 3 270M으로 fallback합니다. 정확한 Hugging Face 모델 ID는 검증 시점에 LM Studio에서 검색해서 확인합니다 — 본문의 `gemma-3n-e2b-it-GGUF` 표기는 검색 시점에 맞는 ID로 바꿔도 됩니다. 작은 모델로 우선 동작 흐름을 익히는 게 목표입니다.

## 1. LM Studio 설치

설치 자체는 [02-ollama-vs-lmstudio-macos.md](./02-ollama-vs-lmstudio-macos.md)와 같습니다. 공식 사이트(<https://lmstudio.ai/>)에서 macOS dmg를 받아 앱을 한 번 실행하면 `lms` CLI가 같이 깔립니다.

**GUI 확인 포인트**: 앱이 정상적으로 뜨고, 좌측에 채팅/검색/내 모델 메뉴가 보이면 OK입니다.

## 2. `lms` CLI 부트스트랩

LM Studio 앱을 한 번 실행한 뒤, CLI를 PATH에 등록합니다. 앱을 한 번도 안 띄운 상태에서는 `~/.lmstudio` 디렉터리 자체가 없을 수 있어서 이 순서가 중요합니다.

```sh
~/.lmstudio/bin/lms bootstrap
```

`bootstrap`은 셸 설정 파일에 PATH를 추가해줍니다. 같은 셸에서는 적용이 안 보일 수 있으니, 새 터미널을 열고 아래 명령어로 동작을 확인합니다.

```sh
lms version
```

<!-- 검증: 사용자 - lms version 출력 결과 -->

버전이 출력되면 CLI 사용 준비가 끝납니다.

## 3. 모델 다운로드

`lms get` 명령어로 모델을 받습니다. 모델 이름은 Hugging Face 표기를 따릅니다.

```sh
lms get google/gemma-3n-e2b-it-GGUF
```

위 모델이 카탈로그에 없으면 가장 작은 Gemma로 fallback합니다.

```sh
lms get google/gemma-3-270m-it-GGUF
```

다운로드가 끝나면 받은 모델 목록을 확인합니다.

```sh
lms ls
```

<!-- 검증: 사용자 - lms ls 출력 결과 -->

**GUI 확인 포인트**: LM Studio 앱의 좌측 "My Models"(폴더 아이콘) 메뉴에 방금 받은 모델이 보이면 CLI와 GUI가 같은 모델 폴더를 보고 있다는 뜻입니다.

## 4. 모델 로드와 CLI 채팅

다운로드와 로드는 별개입니다. 모델을 메모리에 올려야 응답이 가능합니다.

```sh
lms load google/gemma-3n-e2b-it-GGUF
```

로드 상태를 확인합니다.

```sh
lms ps
```

<!-- 검증: 사용자 - lms ps 출력 결과 -->

CLI에서 바로 채팅을 시작합니다.

```sh
lms chat
```

<!-- 검증: 사용자 - 채팅 응답 예시 -->

**GUI 확인 포인트**: GUI 상단의 모델 선택 드롭다운에 같은 모델이 "Loaded"로 표시되면 됩니다. CLI에서 로드한 모델을 GUI에서도 그대로 쓸 수 있습니다.

## 5. OpenAI 호환 서버 시작

다른 앱에서 이 모델을 API로 호출하려면 서버를 띄워야 합니다.

```sh
lms server start --port 1234
```

서버 상태 확인.

```sh
lms server status
```

<!-- 검증: 사용자 - lms server status 출력 결과 -->

**GUI 확인 포인트**: GUI 좌측의 "Developer"(터미널 아이콘) 메뉴에 들어가면 서버 상태와 요청 로그가 실시간으로 보입니다. 외부에서 들어온 요청이 여기에 찍힙니다.

## 6. curl로 서버 동작 확인

서버가 잘 떴는지 OpenAI 호환 엔드포인트로 직접 호출해봅니다.

```sh
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-3n-e2b-it-GGUF",
    "messages": [{"role": "user", "content": "한 줄로 자기소개 해줘"}]
  }'
```

<!-- 검증: 사용자 - curl 응답 결과 -->

JSON 응답에 `choices[0].message.content`가 채워져 있으면 동작 확인 완료입니다.

**GUI 확인 포인트**: 위 curl을 실행한 직후 Developer 탭의 로그에 요청이 찍혀 있어야 합니다.

## 7. 정리: CLI와 GUI를 같이 쓰는 이유

저는 명령어 한 줄씩 진행하는 게 마음에 들었지만, GUI 확인 단계를 같이 두면 다음 효과가 있습니다.

- **모델 다운로드 확인**: 디스크에 정말 받혔는지 GUI로 즉시 보입니다.
- **로드 상태 추적**: CLI의 `lms ps`와 GUI의 모델 선택 드롭다운이 일치하는지 교차 확인됩니다.
- **요청 로그**: Developer 탭은 외부 요청이 들어왔는지 가장 빠르게 알려주는 창구입니다.

CLI만으로도 모든 작업이 되지만, "CLI는 명령, GUI는 모니터" 정도로 역할을 나눠 쓰면 막혔을 때 디버깅이 빨라집니다.

## 8. 정지와 정리

작업이 끝나면 모델을 메모리에서 내리고 서버를 정지합니다.

```sh
lms unload --all
lms server stop
```

<!-- 검증: 사용자 - 정지 후 lms ps, lms server status 결과 -->

## 더 공부할 것

- `lms` 의 `--gpu` 옵션과 `--context-length` 옵션을 조절했을 때 메모리 사용량이 얼마나 달라지는지 측정해보고 싶습니다.
- 모델 폴더를 외장 SSD로 옮겼을 때 로드 속도가 얼마나 영향을 받는지 비교가 필요합니다.

## 참고자료

- LM Studio 공식 사이트: <https://lmstudio.ai/>
- LM Studio CLI(`lms`) 문서: <https://lmstudio.ai/docs/cli>
- LM Studio API 서버 문서: <https://lmstudio.ai/docs/api>
- Gemma 모델 overview: <https://ai.google.dev/gemma/docs/core>
