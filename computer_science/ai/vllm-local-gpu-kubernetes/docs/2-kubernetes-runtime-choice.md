# Kubernetes 환경은 왜 kind보다 k3s로 가는가

## TL;DR

kind는 로컬 Kubernetes 실습 기본값으로 좋지만, GPU inference 실습에서는 노드 자체가 Docker 컨테이너라는 점이 제약이 됩니다. 이 핸즈온은 kind를 검토 대상으로 남기되, 실제 GPU Pod 실행은 k3s를 기본 경로로 선택합니다.

## 왜 처음에는 kind를 검토할까

이 저장소의 Kubernetes 로컬 실습 기본값은 kind입니다. kind는 빠르게 만들고 지우기 쉽고, 클러스터 상태를 실험하기 좋습니다.

그런데 vLLM GPU 실습에서도 kind가 좋은 선택일까요? 컨트롤 플레인이나 일반 Pod 실습이라면 좋습니다. 하지만 GPU는 다릅니다. Pod가 GPU를 쓰려면 아래 조건이 동시에 맞아야 합니다.

- 호스트에 NVIDIA driver가 설치되어 있어야 한다.
- 컨테이너 런타임이 NVIDIA runtime을 알아야 한다.
- Kubernetes node가 `nvidia.com/gpu` 리소스를 advertise해야 한다.
- Pod가 GPU 리소스를 request 또는 limit으로 요청해야 한다.

kind의 node는 호스트 프로세스가 아니라 Docker 컨테이너입니다. kind 문서의 `extraMounts`로 host path를 node 컨테이너에 넘길 수는 있지만, GPU device, runtime, device plugin, kubelet device plugin socket까지 안정적으로 엮는 구성은 실습의 초점보다 복잡해집니다.

## kind를 쓰면 무엇을 얻고 무엇을 잃을까

kind를 선택하면 얻는 것은 간단한 클러스터 생명주기입니다. `kind create cluster`와 `kind delete cluster`만으로 클러스터를 관리할 수 있습니다.

잃는 것은 GPU 경로의 단순성입니다. node가 컨테이너이기 때문에 호스트 GPU 장치와 NVIDIA runtime을 kind node 내부로 전달해야 합니다. 이 구성은 가능 여부가 호스트 Docker, NVIDIA Container Toolkit, kind node image, device plugin 설정에 영향을 많이 받습니다. 이 문서에서는 안정적인 재현 경로로 단정하지 않고 확인 필요로 둡니다.

## k3s를 선택하면 무엇이 달라질까

k3s는 실제 Linux GPU 서버 위에서 kubelet과 containerd를 직접 실행하는 경로에 가깝습니다. K3s 문서는 NVIDIA runtime이 설치되어 있으면 k3s가 대체 container runtime을 감지하고, 기본 runtime을 바꾸지 않았다면 Pod에 `runtimeClassName: nvidia`를 명시하라고 설명합니다.

장점은 GPU 서버 운영 구조와 더 비슷하다는 점입니다. NVIDIA Container Runtime, NVIDIA device plugin, `nvidia.com/gpu` 리소스 요청 흐름을 그대로 볼 수 있습니다.

단점은 kind보다 설치와 정리가 무겁다는 점입니다. 로컬 노트북에서 가볍게 클러스터만 만들고 지우는 경험과는 다릅니다. 그래도 vLLM GPU inference 실습의 목적은 GPU runtime 경로를 이해하는 것이므로, 이 단점은 받아들일 수 있습니다.

## k3d는 왜 기본값으로 두지 않았을까

k3d는 Docker 위에서 k3s를 실행합니다. kind보다 k3s 생태계에 가깝지만, GPU 관점에서는 여전히 node가 컨테이너라는 제약이 남습니다.

그래서 선택지는 이렇게 정리합니다.

| 선택지 | 장점 | 단점 | 이 핸즈온 판단 |
| --- | --- | --- | --- |
| kind | 가장 가볍고 익숙함 | GPU runtime 전달이 복잡함 | 검토만 남김 |
| k3d | k3s를 Docker로 쉽게 실행 | GPU는 여전히 컨테이너 node 제약 | 대안으로만 둠 |
| k3s | 실제 GPU 서버 운영 흐름과 가까움 | 설치와 정리가 무거움 | 기본 실습 경로 |

## k3s에서는 무엇을 확인해야 할까

k3s 설치 전에 NVIDIA runtime이 호스트에 있어야 합니다.

containerd용 NVIDIA runtime 구성을 적용합니다.

```bash
sudo nvidia-ctk runtime configure --runtime=containerd
sudo systemctl restart containerd
```

k3s를 설치하거나 이미 설치되어 있으면 재시작합니다.

```bash
curl -sfL https://get.k3s.io | sh -
sudo systemctl restart k3s
```

k3s containerd 설정에 NVIDIA runtime이 들어갔는지 확인합니다.

```bash
sudo grep nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
```

이 값이 보이지 않으면 Pod manifest를 고쳐도 GPU Pod가 안정적으로 뜨지 않습니다. 먼저 runtime 감지부터 해결해야 합니다.

## 참고자료

- [kind configuration](https://kind.sigs.k8s.io/docs/user/configuration/)
- [K3s NVIDIA Container Runtime support](https://docs.k3s.io/advanced#nvidia-container-runtime-support)
- [NVIDIA Container Toolkit install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
