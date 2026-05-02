# 핸즈온 2: kubernetes 디버깅 (AI 모델 vs AI 에이전트)

핸즈온 1과 같은 비교를 다른 도메인에서 반복한다. **AI 모델 호출 한 번** vs **AI 에이전트(우리가 langgraph로 만든 harness)가 agent loop을 돌리는 것**의 구조 차이를 한 번 더 본다. 도메인이 달라도 구조는 같다는 걸 확인하는 게 목적이다.

상황: **"내 nginx 파드가 안 떠요. ErrImagePull인 것 같은데 디버깅 좀 해줘."**

## 한 턴 안에서 inference가 여러 번 일어난다

핸즈온 1과 가장 다른 점은 **한 턴 안에 inference ↔ 도구 실행이 여러 번 번갈아 일어난다**는 것이다. Codex 글의 multi-turn 다이어그램이 이걸 묘사한다 — 한 턴 안의 ever-growing prompt.

학습자가 "ErrImagePull"이라고 짧게 말해도, 안정 상태에서 `kubectl get pods`가 보여주는 status는 보통 `ImagePullBackOff`다. `ErrImagePull`은 한 번의 pull 시도 실패이고, 재시도가 backoff에 들어가면 `ImagePullBackOff`로 굳는다. 에이전트는 도구로 직접 확인해 더 정확한 표현과 근거 이벤트를 답변에 같이 인용한다:

1. 첫 inference에서 `kubectl_get_pods` 호출을 요청
2. 도구 결과(`ImagePullBackOff`)를 prompt에 누적
3. 두 번째 inference에서 사용자 표현과의 차이를 인지하고 `kubectl_describe_pod` 추가 호출
4. 도구 결과(이미지 pull 실패 이벤트)를 prompt에 누적
5. 세 번째 inference에서 최종 정답 생성 (assistant message → 턴 종료)

같은 그래프(`call_model` ↔ `tools`)를 **세 번 도는 것**이 핵심이다 — 도구를 한 번 더 부른다고 그래프가 바뀌는 게 아니다. agent loop이 자연스럽게 여러 iteration을 처리한다.

## 사전 준비

kind, kubectl, make가 설치되어 있어야 한다.

클러스터 띄우고 일부러 망가진 nginx Pod 배포:

```bash
make cluster-up
make apply-broken
sleep 30  # 파드 상태 안정화 (kubelet이 이미지 pull 시도하고 실패할 시간)
kubectl get pods  # 상태 확인 — ImagePullBackOff 또는 ErrImagePull이어야 함
```

`manifests/broken-nginx.yaml`은 `nginx:1.99-totally-fake-tag`라는 존재하지 않는 태그를 쓴다. 의도적으로 망가져 있다.

## Step A — AI 모델 호출 한 번 (`src/ex03_k8s_model.py`)

질문 그대로 모델에 던진다. inference 한 번이다.

```python
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
import os

load_dotenv()

def main():
  llm = init_chat_model(os.getenv("LLM_MODEL", "openai:gpt-4o-mini"))
  question = "내 nginx 파드가 안 떠요. ErrImagePull인 것 같은데 디버깅 좀 해줘."
  print(f"[USER] {question}")
  response = llm.invoke(question)
  print(f"[ASSISTANT] {response.content}")

if __name__ == "__main__":
  main()
```

실행:

```bash
uv run python -m src.ex03_k8s_model
```

기대 답변 형태: 모델은 클러스터를 볼 수 없으므로 일반론(흔한 ErrImagePull 원인 5개 — 잘못된 이미지 태그, private registry 인증 문제, network/DNS, 등) 또는 사용자에게 정보를 되묻는 답을 준다.

**관찰 포인트**:

- 코드는 `llm.invoke(question)` 한 줄. 모델은 stateless 함수이므로 클러스터 상태를 가져올 길 자체가 없다.
- 사용자 말("ErrImagePull")을 검증할 근거(=클러스터 데이터)도 없다. 모델 단독에서는 외부 코드(=에이전트)가 없으니까.
- Step B에서 추가하는 것은 모델의 능력이 아니라 **모델을 감싸는 외부 코드(에이전트)**다.

## Step B — AI 에이전트가 agent loop을 돌린다 (`src/ex04_k8s_agent.py`)

핸즈온 1과 동일한 agent loop 구조에 도구만 3개로 늘었다. 시스템 프롬프트를 추가해 사용자 표현을 의심하라고 지시한다.

```python
def _run(cmd: list[str]) -> str:
  result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
  return result.stdout if result.returncode == 0 else f"ERROR: {result.stderr}"

@tool
def kubectl_get_pods() -> str:
  """default namespace의 모든 Pod 목록과 상태를 반환한다."""
  return _run(["kubectl", "get", "pods", "-o", "wide"])

@tool
def kubectl_describe_pod(name: str) -> str:
  """특정 Pod의 상세 정보(이벤트 포함)를 반환한다."""
  return _run(["kubectl", "describe", "pod", name])

@tool
def kubectl_get_events() -> str:
  """default namespace의 최근 이벤트를 시간순으로 반환한다."""
  return _run(["kubectl", "get", "events", "--sort-by=.lastTimestamp"])
```

시스템 프롬프트:

> 당신은 Kubernetes 디버깅 어시스턴트다. 사용자의 표현(예: ErrImagePull)이 실제 상태와 다를 수 있으므로, 도구로 클러스터 상태를 직접 확인한 뒤 답변하라. 근거가 되는 이벤트나 상태를 답변에 함께 인용한다.

그래프 구조는 `ex02`와 동일하다 — `call_model` ↔ `tools` 사이를 conditional edge로 도는 단일 loop. 다른 점은 도구가 3개라는 것뿐이다.

전체 코드는 `src/ex04_k8s_agent.py`를 본다.

실행:

```bash
uv run python -m src.ex04_k8s_agent
```

## 기대 흐름 — 한 턴 안 inference 3번

색깔 / 라벨 의미는 [docs/03](03-handson-weather.md#콘솔-trace-읽는-법)과 [docs/05](05-tracing-aiagent.md) 참고.

```
흰색 USER ("내 nginx 파드가 안 떠요. ErrImagePull인 것 같은데...")
  ↓
청록 LOOP CONTINUE (call_model: kubectl_get_pods 호출, accumulated_messages=2)
  ↓
노랑 TOOL RESULT (tools: NAME=broken-nginx STATUS=ImagePullBackOff ..., accumulated_messages=3)
  ↓
청록 LOOP CONTINUE (call_model: 사용자 표현과 다름을 인지 → kubectl_describe_pod("broken-nginx"), accumulated_messages=4)
  ↓
노랑 TOOL RESULT (tools: "Failed to pull image nginx:1.99-totally-fake-tag" 이벤트, accumulated_messages=5)
  ↓
초록 TURN END (call_model: 최종 답변, accumulated_messages=6)
  → 정정: 실제 status는 ImagePullBackOff입니다 (ErrImagePull은 한 번의 pull 시도 실패, 재시도 backoff 단계의 표현이 ImagePullBackOff)
  → 원인: nginx:1.99-totally-fake-tag 태그가 Docker Hub에 존재하지 않음
  → 해결책: image를 nginx:1.27 같은 유효한 태그로 변경 후 재배포
  ↓
turn summary (loop iteration=3, accumulated_messages=6)
```

이게 **agent loop의 한 턴 = 같은 그래프(`call_model` ↔ `tools`)를 여러 iteration 도는 것**의 실물이다. 그래프 모양은 바뀌지 않고, conditional edge가 매번 "tool_calls 있음 → tools, 없음 → END"를 평가한다. `accumulated_messages`가 step마다 +1씩 증가하는 게 Codex 글의 ever-growing prompt다.

## 디버깅 연습 1 — 시스템 프롬프트 일부 제거

`src/ex04_k8s_agent.py`의 `system_prompt`에서 "도구로 클러스터 상태를 직접 확인하라" 문장을 지운다.

```python
system_prompt = "당신은 Kubernetes 디버깅 어시스턴트다."
```

기대 결과: 모델이 도구를 부르지 않거나, `kubectl_get_pods`만 한 번 부르고 사용자 표현을 그대로 인정해버릴 가능성이 높다.

축 분석:

- AIMessage.tool_calls가 비어있거나 부족하다 → **reasoning 축**.
- 도구 코드는 그대로 멀쩡하다.
- 고치는 곳: 시스템 프롬프트 (모델 입력).

## 디버깅 연습 2 — `kubectl_describe_pod`의 docstring 비우기

```python
@tool
def kubectl_describe_pod(name: str) -> str:
  """"""
  return _run(["kubectl", "describe", "pod", name])
```

기대 결과: 모델이 이 도구를 안 부르거나, 인자를 엉뚱하게 채울 수 있다.

축 분석:

- AIMessage.tool_calls.args가 이상하다 / 도구가 호출되지 않는다 → **reasoning 축**.
- 도구 코드는 동작한다.
- 고치는 곳: docstring (도구 description, 모델 입력의 일부).

## 디버깅 연습 3 — `_run`의 timeout을 1초로

```python
def _run(cmd: list[str]) -> str:
  result = subprocess.run(cmd, capture_output=True, text=True, timeout=1)
  ...
```

기대 결과: `_run()`이 `subprocess.TimeoutExpired`를 잡아 `ERROR: timeout after 1s — kubectl ...` 같은 문자열을 반환하므로, ToolMessage에 그 ERROR가 그대로 찍힌다. 모델은 그 에러 메시지를 받고 다시 시도하거나, 사용자에게 환경 문제를 보고할 수 있다.

축 분석:

- ToolMessage가 ERROR다 → **tool 축**.
- 모델 입력에는 문제가 없다.
- 고치는 곳: 도구 코드의 timeout, 또는 환경 (네트워크, 클러스터 상태).

## 정리

```bash
make clean-broken
make cluster-down
```

## 참고자료

- kind: <https://kind.sigs.k8s.io/>
- Kubernetes 1.35 릴리스 노트: <https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/>
- ImagePullBackOff vs CrashLoopBackOff (kubernetes 공식 troubleshooting): <https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/>
