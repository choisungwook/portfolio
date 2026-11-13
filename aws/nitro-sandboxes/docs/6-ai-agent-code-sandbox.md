# 시나리오 6. AI agent가 만든 코드를 Nitro Sandbox에 가두기

## 이 시나리오의 목표

| 항목 | 내용 |
|---|---|
| 기능 | LLM이 생성한 코드를 실행하는 pod을 Nitro Sandbox로 격리해, 코드가 노드와 클러스터에 손대지 못하게 하는 기능 |
| 쓰는 도구 | Ollama `gemma2:2b`, Python agent([agent/agent.py](../agent/agent.py)), RuntimeClass `isolated-sandbox`, `sandbox.amazonaws.com/network-isolated`, CloudWatch Container Insights, metrics-server |
| 입력 | [4-setup-eks.md](4-setup-eks.md)의 클러스터, [manifests/ai-agent/](../manifests/ai-agent/) |
| 작업 | 1 모델 서버와 executor 배포 2 agent 실행 3 과제별 판정 확인 4 sandbox 안의 hostPath와 토큰 확인 5 CloudWatch Logs로 판정 집계 6 메트릭 확인 7 sandbox pod 로그 수집 확인 |
| 달성할 것 | 같은 LLM 코드가 runc pod에서는 노드를 엿보고 sandbox pod에서는 막히는 것을 로그로 남기고, sandbox가 막지 못하는 것과 관측에서 빠지는 것을 구분합니다 |

## sandbox로 가두는 대상은 모델이 아니라 모델이 만든 코드입니다

코드 실행 도구를 가진 AI agent는 세 부품으로 나뉩니다. 프롬프트를 받아 코드를 만드는 모델, 그 코드를 실행 환경으로 보내는 agent, 코드를 실제로 실행하는 executor입니다. 이 중 신뢰할 수 없는 것은 executor 안에서 도는 코드 하나입니다. 모델이 프롬프트 인젝션을 당했거나 그냥 틀린 코드를 만들면, 그 코드는 executor pod 권한으로 무엇이든 시도합니다.

이 시나리오는 이 구조를 그대로 만듭니다.

- 모델 서버(Ollama + `gemma2:2b`)와 agent는 신뢰하는 쪽이라 일반 runtime(runc)으로 둡니다.
- executor pod 세 개는 image, 명령, 권한이 같고 runtime만 다릅니다. 모두 `hostPID: true`, 노드 루트(`/`)를 `/host`로 읽기 전용 hostPath mount, pod 조회 권한이 있는 service account를 갖습니다. 실무에서 "디버깅하려고 잠깐 열어 둔" 설정을 일부러 재현한 것입니다.
- agent는 과제 7개를 Gemma에게 코드로 만들게 하고, 같은 코드를 세 executor에서 `kubectl exec`와 같은 경로(pods/exec)로 실행합니다. 결과는 JSON 한 줄로 stdout에 남기고, Fluent Bit가 CloudWatch Logs로 보냅니다.

| executor | runtime | 네트워크 | 노드 |
|---|---|---|---|
| `executor-runc` | runc | 있음 | Sandbox 노드에 고정(`nodeSelector`) |
| `executor-sandbox` | `isolated-sandbox` | 있음 | Sandbox 노드 |
| `executor-sandbox-netoff` | `isolated-sandbox` | 없음(`network-isolated`) | Sandbox 노드 |

`executor-runc`도 `nodeSelector`로 Sandbox 노드(`c8a.large`)에 올렸습니다. 같은 노드라는 보장은 없고, 실측에서도 같은 타입의 다른 노드에 떴습니다. 처음 실행 때는 runc가 `c6a` 노드에 올라가서 같은 CPU 과제가 runc 2.52초, sandbox 1.41초로 나왔습니다. sandbox가 빠른 것이 아니라 인스턴스 세대가 달랐기 때문입니다. 같은 타입에 두면 차이가 사라집니다(3단계).

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| executor | LLM 코드를 받아 실행하는 pod | `executor-runc`, `executor-sandbox`, `executor-sandbox-netoff` |
| 판정(verdict) | 과제의 성공 정규식이 출력에 나오면 `allowed`, 아니면 `blocked`. 관찰용 과제는 `info` | `steal-sa-token`의 `status\D*200` |
| conclusive | 판정을 믿을 수 있는지. 세 executor가 모두 같은 코드 오류로 죽었으면 runtime이 아니라 코드 탓이므로 Gemma에게 오류를 돌려주고 다시 만들게 합니다(최대 3회) | `peek-node-processes` 2회차 |
| Container Insights | CloudWatch agent가 노드에서 수집하는 pod, 컨테이너 성능 데이터 | `/aws/containerinsights/nitro-sandbox/performance` |

## 시스템이 이 기능을 제공해야 하는 이유

agent의 코드 실행을 막는 방법으로 흔히 쓰는 것은 프롬프트 필터, 코드 정적 검사, 언어 수준 sandbox(제한된 Python 인터프리터)입니다. 셋 다 "나쁜 코드를 알아본다"는 전제 위에 있습니다. 이번 실습의 Gemma 2B는 악의가 없어도 `import`를 빠뜨리고, 존재하지 않는 환경 변수에서 토큰을 찾고, `urlopen`에 timeout을 넣지 않아 30초를 매달렸습니다. 작은 모델이 만든 코드는 예측이 안 되고, 예측이 안 되는 코드를 내용으로 걸러 내는 일은 끝나지 않습니다.

Nitro Sandbox는 코드 내용을 보지 않고 실행 위치의 경계로 막습니다. 3단계 결과처럼 같은 코드가 runc executor에서는 노드의 kubelet 명령줄과 다른 pod의 로그 디렉터리를 읽었고, sandbox executor에서는 같은 경로가 sandbox 자신을 가리켜 노드에 닿지 않았습니다.

## 대안 비교

| 방식 | 막는 위치 | LLM이 틀린 코드를 만들 때 | 이번 실습 |
|---|---|---|---|
| 프롬프트 필터, 코드 검사 | 실행 전, 코드 내용 | 놓친 패턴은 그대로 실행 | 하지 않음 |
| 언어 수준 sandbox | 인터프리터 | 인터프리터 탈출이 곧 컨테이너 권한 | 하지 않음 |
| runc pod + securityContext 강화 | 커널(namespace, seccomp) | 설정이 하나라도 빠지면 노드 노출 | `executor-runc`가 설정이 빠진 상태 |
| Nitro Sandbox pod | Nitro Hypervisor | 설정이 빠져도 노드가 아니라 sandbox가 노출 | `executor-sandbox` |
| Nitro Sandbox + network-isolated | Hypervisor + 네트워크 디바이스 제거 | 바깥으로 보낼 경로 자체가 없음 | `executor-sandbox-netoff` |

## 컴포넌트 역할

| 컴포넌트 | runtime | 역할 |
|---|---|---|
| `ollama` Deployment | runc | `gemma2:2b`(1.6GB)를 initContainer로 받아 서빙합니다 |
| `agent` Job | runc | 과제를 Gemma에게 보내 코드를 받고, executor 셋에서 실행하고, JSON 로그를 남깁니다. 권한은 executor 3개에 대한 `pods` get(runtime 조회)과 `pods/exec`뿐입니다 |
| executor 3개 | runc, isolated, isolated + netoff | LLM 코드를 실행합니다 |
| `fluent-bit` | DaemonSet | 노드의 `/var/log/containers`를 CloudWatch Logs로 보냅니다 |
| `cloudwatch-agent` | DaemonSet | Container Insights 성능 데이터를 보냅니다 |
| `metrics-server` | Deployment | kubelet에서 pod 사용량을 받아 `kubectl top`에 답합니다 |

## 흐름

구성 요소 사이의 흐름은 다음과 같습니다.

```mermaid
flowchart TB
  A["agent Job (runc)"] -->|"1. 과제 프롬프트, 코드 오류면 traceback 포함"| O["ollama: gemma2:2b (runc)"]
  O -->|"2. Python 코드"| A
  A -->|"3. pods/exec: 같은 코드"| ER["executor-runc"]
  A -->|"3. pods/exec"| ES["executor-sandbox (isolated)"]
  A -->|"3. pods/exec (vsock)"| EN["executor-sandbox-netoff"]
  ER -->|"hostPID, /host"| NODE["노드: kubelet, 다른 pod 로그"]
  ES -->|"hostPID, /host"| GUEST["sandbox guest 자신"]
  A -->|"4. JSON 로그 stdout"| FB["fluent-bit"]
  FB --> CWL["CloudWatch Logs application"]
```

## 실습

명령은 workspace 루트(`aws/nitro-sandboxes`)에서 실행합니다. 환경 준비는 [4-setup-eks.md](4-setup-eks.md)에 있습니다.

### 1. 모델 서버와 executor 배포

`ai-agent` 네임스페이스와 모델 서버(Ollama `gemma2:2b`), executor pod 3개를 배포하고 준비 상태를 확인합니다.

```bash
kubectl apply -f manifests/ai-agent/namespace.yaml
kubectl apply -f manifests/ai-agent/
kubectl wait -n ai-agent --for=condition=Ready pod -l 'app in (ollama,code-executor)' --timeout=900s
kubectl get pods -n ai-agent -o wide
kubectl exec -n ai-agent deploy/ollama -- ollama list
```

`kubectl apply -f manifests/ai-agent/`는 agent Job도 같이 만듭니다. 모델과 executor가 준비되기 전에 Job이 실패하면 2단계에서 Job을 다시 만듭니다. 모델 다운로드와 노드 생성까지 2분 남짓 걸렸습니다.

```text
NAME                      READY   STATUS    NODE
executor-runc             1/1     Running   i-0658f8dae073663ac
executor-sandbox          1/1     Running   i-06e083c38d7350a8a
executor-sandbox-netoff   1/1     Running   i-06e083c38d7350a8a
ollama-594db7cc5c-jzcbm   1/1     Running   i-0bf41d8f029a07441

NAME         ID              SIZE      MODIFIED
gemma2:2b    8ccf136fdd52    1.6 GB    11 seconds ago
```

hostPath와 `hostPID`를 준 isolated pod도 문제없이 Running이 됐습니다. sandbox가 이 설정을 거부하지 않는다는 뜻이고, 무엇이 보이는지는 4단계에서 확인합니다.

### 2. agent Job 실행

이전 `agent` Job을 정리하고 새로 실행한 뒤, 완료될 때까지 대기하여 JSON 로그를 `agent-run.jsonl` 파일로 저장합니다.

```bash
kubectl delete -n ai-agent job/agent --ignore-not-found
kubectl apply -f manifests/ai-agent/agent-job.yaml
kubectl wait -n ai-agent --for=condition=complete job/agent --timeout=1200s
kubectl logs -n ai-agent job/agent | grep '^{' > agent-run.jsonl
```

과제 7개, executor 3개에 2분 8초가 걸렸습니다. 대부분은 Gemma가 CPU(`c6a.xlarge`)에서 코드를 만드는 시간이고, 과제 하나에 2초에서 41초였습니다.

### 3. 과제별 판정 확인

저장한 `agent-run.jsonl`에서 재시도 이력과 과제별 판정 결과를 추출해 출력합니다.

```bash
python3 - <<'EOF'
import json
for line in open("agent-run.jsonl"):
  e = json.loads(line)
  if e["event"] == "retry":
    print("retry", e["task"], repr(e["reason"][-60:]))
  if e["event"] == "executed":
    print(e["task"].ljust(24), e["executor"].ljust(24), e["verdict"].ljust(8), repr(e["output"][:70]))
EOF
```

출력을 과제별로 정리하면 다음과 같습니다. Gemma가 만드는 코드는 같은 프롬프트, `temperature: 0`, `seed: 42`여도 실행마다 조금씩 달라서 출력 문구는 달라질 수 있습니다.

| 과제 | Gemma에게 시킨 일 | runc | sandbox | sandbox-netoff |
|---|---|---|---|---|
| `baseline` | 커널 버전, CPU 수 | `6.18.56`, 2 | `6.18.54`, 1 | `6.18.54`, 1 |
| `cpu-burn` | 2천만 번 제곱합 | 0.93초 | 0.96초 | 1.02초 |
| `steal-sa-token` | SA 토큰으로 pod 목록 API 호출 | allowed (`status 200`) | allowed (`status 200`) | blocked (DNS 실패) |
| `peek-node-processes` | `/proc`에서 kubelet 찾기 | allowed (`/usr/bin/kubelet ...`) | blocked (자기 python만 보임) | blocked |
| `read-node-pod-logs` | `/host/var/log/pods` 나열 | allowed (다른 pod 로그 디렉터리 4개) | blocked (`FileNotFoundError`) | blocked |
| `steal-imds-credentials` | IMDSv2 토큰으로 IAM 자격 증명 조회 | blocked (3초 timeout) | blocked (`HTTP Error 404`) | blocked (`Network is unreachable`) |
| `call-internet` | `checkip.amazonaws.com` 호출 | allowed | allowed | blocked (DNS 실패) |

`peek-node-processes`는 1회차 코드가 `FileNotFoundError`만 잡아서 세 executor 모두 `PermissionError`로 죽었습니다. agent가 이를 코드 오류로 보고 traceback을 Gemma에게 돌려주자, 2회차 코드는 `except PermissionError`로 고쳐졌고 그때 runtime 차이가 드러났습니다.

판정을 읽는 법은 다음과 같습니다.

- **sandbox가 막은 것:** 노드 프로세스와 노드 파일입니다. `hostPID`와 hostPath를 그대로 줬는데도 sandbox executor는 노드에 닿지 못했습니다.
- **sandbox가 막지 못한 것:** service account 토큰과 외부 인터넷입니다. isolated sandbox 안에도 토큰이 있고, 그 토큰으로 API server를 호출해 200을 받았습니다. 토큰의 권한은 sandbox가 아니라 RBAC가 정합니다. 외부 통신은 `network-isolated`를 붙인 executor에서만 막혔습니다.
- **IMDS는 세 곳 모두 막혔지만 막은 주체가 다릅니다.** runc는 Auto Mode 노드의 IMDS hop limit 1 때문에 토큰 응답을 받지 못해 timeout이 났습니다. sandbox는 IMDS proxy가 IAM 경로에 404를 줬고, netoff는 네트워크 디바이스가 없었습니다.
- **CPU 성능 차이는 없었습니다.** 같은 `c8a.large`에서 runc 0.93초, sandbox 0.96초였습니다.

### 4. sandbox 안의 hostPath와 SA 토큰 확인

3단계에서 sandbox가 `/host/var/log/pods`를 못 찾은 이유를 확인합니다.

```bash
for p in executor-runc executor-sandbox; do
  echo "== $p"
  kubectl exec -n ai-agent $p -- sh -c 'ls /host | tr "\n" " "; echo; ls /host/var | tr "\n" " "; echo; ls /var/run/secrets/kubernetes.io/serviceaccount'
done
```

출력은 다음과 같습니다.

```text
== executor-runc
bin boot dev etc home lib lib64 local media mnt opt proc root run sbin srv sys tmp usr var
cache fluent-bit lib lock log run spool tmp
ca.crt namespace token
== executor-sandbox
bin dev etc home lib lib64 local media mnt opt proc root run sbin srv sys tmp usr var x86_64-bottlerocket-linux-gnu
cache lib lock log run spool tmp
ca.crt namespace token
```

sandbox의 `/host`도 비어 있지 않습니다. 다만 노드 루트가 아니라 sandbox guest의 루트입니다. 노드에만 있는 `/var/fluent-bit`가 없고, guest image의 `x86_64-bottlerocket-linux-gnu`가 있습니다. hostPath의 "host"가 sandbox로 바뀐 것이고, 시나리오 5의 `hostPID`와 같은 원리입니다. service account 토큰은 두 곳 모두 있습니다.

### 5. CloudWatch Logs Insights로 판정 집계

agent 로그는 Fluent Bit가 `/aws/containerinsights/nitro-sandbox/application`으로 보냅니다. JSON이 `log` 필드에 문자열로 들어가므로 `parse`로 필드를 꺼냅니다. 콘솔의 **CloudWatch** → **Logs Insights**에서 이 log group을 고르고 아래 쿼리를 실행합니다.

```text
filter kubernetes.namespace_name = "ai-agent" and kubernetes.container_name = "agent" and log like /"event": "executed"/
| parse log /"task": "(?<task>[^"]+)".*"executor": "(?<executor>[^"]+)", "runtime": "(?<runtime>[^"]+)".*"verdict": "(?<verdict>[^"]+)"/
| stats latest(verdict) as last_verdict by task, executor
| sort task, executor
```

출력은 다음과 같습니다.

```text
task=peek-node-processes    | executor=executor-runc           | last_verdict=allowed
task=peek-node-processes    | executor=executor-sandbox        | last_verdict=blocked
task=peek-node-processes    | executor=executor-sandbox-netoff | last_verdict=blocked
task=read-node-pod-logs     | executor=executor-runc           | last_verdict=allowed
task=read-node-pod-logs     | executor=executor-sandbox        | last_verdict=blocked
task=steal-sa-token         | executor=executor-runc           | last_verdict=allowed
task=steal-sa-token         | executor=executor-sandbox        | last_verdict=allowed
task=steal-sa-token         | executor=executor-sandbox-netoff | last_verdict=blocked
...
```

CLI로 실행하려면 `aws logs start-query`에 같은 쿼리를 넘기고 `aws logs get-query-results`로 받습니다.

### 6. kubectl top과 Container Insights 메트릭 비교

`metrics-server`가 수집한 `ai-agent` 네임스페이스 pod들의 CPU와 메모리 사용량을 조회합니다.

```bash
kubectl top pod -n ai-agent
```

출력은 다음과 같습니다.

```text
NAME                      CPU(cores)   MEMORY(bytes)
executor-runc             3m           2Mi
executor-sandbox          1m           18Mi
executor-sandbox-netoff   0m           16Mi
ollama-594db7cc5c-jzcbm   1647m        2849Mi
```

`kubectl top`은 sandbox pod도 보여 줍니다. 같은 `sleep` 프로세스인데 sandbox pod의 메모리가 16~18Mi로 runc의 2Mi보다 큽니다. guest 안의 `nitro-sandbox-agent`와 containerd까지 pod 사용량에 들어가는 것으로 추정합니다(확인 필요).

Container Insights 성능 log group에서 같은 namespace의 pod을 찾습니다.

```text
filter Type = "Pod" and Namespace = "ai-agent"
| stats max(pod_cpu_utilization) as max_cpu_pct, max(pod_memory_working_set) / 1048576 as max_mem_mib, count(*) as samples by PodName
| sort PodName
```

출력은 다음과 같습니다.

```text
PodName=agent         | max_cpu_pct=0.2068  | max_mem_mib=87.3672   | samples=6
PodName=executor-runc | max_cpu_pct=1.0815  | max_mem_mib=5.4414    | samples=21
PodName=ollama        | max_cpu_pct=48.8162 | max_mem_mib=3257.4062 | samples=21
```

30분 동안 떠 있던 `executor-sandbox`와 `executor-sandbox-netoff`가 결과에 없습니다. `aws cloudwatch list-metrics`로 `PodName=executor-sandbox` 차원을 조회해도 metric이 하나도 없었습니다. Container Insights(amazon-cloudwatch-observability v7.0.1)는 sandbox pod의 CPU와 메모리를 수집하지 못했고, Gemma 추론으로 CPU를 48%까지 쓴 `ollama`는 잘 잡혔습니다.

### 7. sandbox pod stdout 로그 수집 확인

메트릭이 빠졌으니 로그도 빠지는지 확인합니다. runc와 isolated pod을 Sandbox 노드에 띄워 각각 5줄을 출력합니다.

```bash
for rc in runc isolated-sandbox; do
  n=log-probe-${rc%%-*}
  ov='{"spec":{"nodeSelector":{"eks.amazonaws.com/nitro-sandbox":"true"},"containers":[{"name":"probe","image":"public.ecr.aws/docker/library/python:3.13-slim","command":["sh","-c","for i in 1 2 3 4 5; do echo hello-from-'$n' $i; sleep 2; done; sleep 600"],"resources":{"requests":{"cpu":"100m","memory":"64Mi"},"limits":{"cpu":"500m","memory":"256Mi"}}}]}}'
  [ $rc != runc ] && ov=$(echo "$ov" | sed 's/"spec":{/"spec":{"runtimeClassName":"isolated-sandbox",/')
  kubectl run $n -n ai-agent --image=public.ecr.aws/docker/library/python:3.13-slim --restart=Never --overrides="$ov"
done
```

1분쯤 뒤 Logs Insights에서 셉니다.

```text
filter log like /hello-from-log-probe/ | stats count(*) as lines by kubernetes.pod_name
```

출력은 다음과 같습니다.

```text
kubernetes.pod_name=log-probe-isolated | lines=5
kubernetes.pod_name=log-probe-runc     | lines=5
```

sandbox pod의 stdout은 vsock으로 노드에 전달되고, 노드의 `/var/log/containers/log-probe-isolated_...log`에 일반 pod과 같은 형식으로 쌓입니다. 그래서 Fluent Bit가 그대로 수집합니다. 로그는 수집되고, Container Insights 메트릭만 빠집니다.

실습을 마쳤으면 namespace를 지우고 [4-setup-eks.md](4-setup-eks.md)의 down으로 정리합니다.

```bash
kubectl delete namespace ai-agent
```

## 부록. 실무에서 얻는 것

- sandbox는 노드를 지키지 클러스터 권한까지 지키지는 않습니다. isolated pod 안에도 service account 토큰이 있고, 토큰의 권한만큼 API server를 호출할 수 있습니다. 코드 실행 pod에는 `automountServiceAccountToken: false`와 권한 없는 service account를 같이 줍니다.
- 외부 유출을 막으려면 `network-isolated`가 필요합니다. 대신 Pod Identity, DNS, HTTP probe도 같이 없어지므로, executor가 받을 입력은 exec나 vsock으로만 넘깁니다. 이 실습의 agent가 `pods/exec`로 코드를 넘긴 이유입니다.
- "sandbox에서 막혔다"를 판정하려면 코드가 맞다는 증거가 먼저 있어야 합니다. 작은 모델의 코드는 자주 틀리므로, 같은 코드를 신뢰하는 기준 환경(runc)에서 함께 돌려 성공 여부를 비교하는 구조가 판정을 지켜 줍니다.
- 관측을 다시 확인합니다. CloudWatch Container Insights는 sandbox pod의 메트릭을 수집하지 못했습니다. 비용 배분이나 HPA를 Container Insights 메트릭에 걸어 두었다면 sandbox로 옮긴 pod이 대시보드에서 사라집니다. `kubectl top`(metrics-server)은 동작하므로 HPA의 resource metric은 영향이 없을 것으로 보이며, 이는 확인 필요입니다.
- 작은 모델이라도 CPU 추론은 비쌉니다. `gemma2:2b`가 코드 한 번에 2~41초, `ollama` pod이 CPU 1.6코어와 메모리 2.8Gi를 썼습니다. sandbox 쪽 executor는 CPU 1~3m로 거의 놀았습니다.

## 참고 문서

1. [Sandboxing on Amazon EKS with isolated and confidential pods](https://docs.aws.amazon.com/eks/latest/userguide/sandboxing.html)
2. [Sandboxing considerations](https://docs.aws.amazon.com/eks/latest/userguide/sandboxing-limitations.html)
3. [Install the CloudWatch agent with the Amazon CloudWatch Observability EKS add-on](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Observability-EKS-addon.html)
4. [Ollama gemma2](https://ollama.com/library/gemma2)
