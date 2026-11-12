# manifests

최상위 파일은 시나리오 5에서 `kubectl apply`로 직접 적용하는 pod manifest입니다. 다섯 pod은 image와 명령이 같고 runtime class와 annotation만 다릅니다.

| 디렉터리/파일 | 설명 |
|---|---|
| `runc-pod.yaml` | 비교 대상. runtime class 없이 노드 커널을 공유하는 일반 pod |
| `isolated-pod.yaml` | `runtimeClassName: isolated-sandbox`. pod 하나가 Nitro Sandbox 하나 |
| `isolated-network-off-pod.yaml` | isolated pod에 `sandbox.amazonaws.com/network-isolated: "true"`를 붙여 네트워크 디바이스를 없앤 pod |
| `runc-hostpid-pod.yaml` | `runc-pod`에 `hostPID: true`를 더한 pod. 노드 프로세스가 보이는지 비교 |
| `isolated-hostpid-pod.yaml` | `isolated-pod`에 `hostPID: true`를 더한 pod. 보이는 범위가 Sandbox로 한정되는지 비교 |
| `ai-agent/` | 시나리오 6. Ollama `gemma2:2b`, agent Job, executor pod 3개와 RBAC. agent 코드는 `agent-configmap.yaml`에 [agent/agent.py](../agent/agent.py)를 그대로 담음 |
