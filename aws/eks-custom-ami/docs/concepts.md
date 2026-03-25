# nodeadm과 커스텀 AMI 노드 조인

## 목차

- [공부 배경](#공부-배경)
- [이 글을 읽고 답할 수 있는 질문](#이-글을-읽고-답할-수-있는-질문)
- [nodeadm이 뭔가요?](#nodeadm이-뭔가요)
- [커스텀 AMI로 만든 노드는 어떻게 클러스터에 조인하나요?](#커스텀-ami로-만든-노드는-어떻게-클러스터에-조인하나요)
- [Managed Node Group에서는 어떻게 동작하나요?](#managed-node-group에서는-어떻게-동작하나요)
- [Karpenter에서는 어떻게 동작하나요?](#karpenter에서는-어떻게-동작하나요)
- [커스텀 설정이 필요할 때](#커스텀-설정이-필요할-때)
- [커스텀 AMI에서 하면 안 되는 것](#커스텀-ami에서-하면-안-되는-것)
- [결론](#결론)
- [참고자료](#참고자료)

## 공부 배경

커스텀 EKS AMI를 만들 때 가장 먼저 드는 질문은 "이 AMI로 만든 노드가 EKS 클러스터에 조인할 수 있나?"입니다.

결론부터 말하면, **EKS optimized AMI를 base로 사용하면 별도 설정 없이 조인됩니다.** 왜 그런지 이해하려면 nodeadm을 알아야 합니다.

## 이 글을 읽고 답할 수 있는 질문

- nodeadm은 무엇이고, 기존 `bootstrap.sh`와 뭐가 다른가요?
- 커스텀 AMI로 만든 노드가 EKS 클러스터에 조인하는 과정은 어떻게 되나요?
- Managed Node Group과 Karpenter에서 커스텀 AMI를 어떻게 사용하나요?
- 커스텀 AMI에서 건드리면 안 되는 것은 무엇인가요?

## nodeadm이 뭔가요?

**nodeadm은 AL2023 EKS AMI에서 노드를 클러스터에 조인시키는 도구입니다.** 기존 AL2에서 쓰던 `/etc/eks/bootstrap.sh`를 대체합니다.

| | AL2 (기존) | AL2023 (현재) |
|---|---|---|
| 조인 도구 | `/etc/eks/bootstrap.sh` | `nodeadm` |
| 설정 형식 | shell script 인자 | YAML (NodeConfig) |
| 클러스터 정보 | API 호출로 자동 검색 | 명시적으로 제공 필요 |

중요한 점: EKS optimized AMI에 nodeadm이 이미 설치되어 있습니다. 커스텀 AMI에서 별도로 설치할 필요가 없습니다.

## 커스텀 AMI로 만든 노드는 어떻게 클러스터에 조인하나요?

조인 과정은 5단계입니다.

1. EC2 인스턴스 부팅
2. nodeadm이 자동으로 실행됨
3. NodeConfig 읽기 (user data 또는 `/etc/eks/nodeadm.d/` drop-in 파일)
4. kubelet이 API 서버에 등록
5. 노드가 클러스터에 조인됨

**핵심: nodeadm은 부팅 시 자동 실행됩니다. user data에서 `nodeadm init`을 직접 호출하면 안 됩니다.**

## Managed Node Group에서는 어떻게 동작하나요?

기본 AMI를 사용하면 AWS가 자동으로 NodeConfig user data를 주입합니다. 별도 설정이 필요 없습니다.

**커스텀 AMI를 사용하면 동작이 다릅니다.** Launch template에 커스텀 AMI(`image_id`)를 지정하면 AWS가 NodeConfig를 자동 주입하지 않습니다. 직접 user data에 NodeConfig를 넣어야 합니다.

NodeConfig에 필요한 정보:

- `apiServerEndpoint` — EKS 클러스터 API endpoint
- `certificateAuthority` — 클러스터 CA 인증서 (base64)
- `cidr` — 서비스 CIDR

MIME multi-part 형식으로 user data에 포함해야 합니다.

```yaml
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="BOUNDARY"

--BOUNDARY
Content-Type: application/node.eks.aws

---
apiVersion: node.eks.aws/v1alpha1
kind: NodeConfig
spec:
  cluster:
    name: <클러스터 이름>
    apiServerEndpoint: <API endpoint>
    certificateAuthority: <CA 인증서>
    cidr: <서비스 CIDR>

--BOUNDARY--
```

이 프로젝트의 EKS 모듈은 `ami_id`가 설정되면 NodeConfig를 자동 생성합니다.

## Karpenter에서는 어떻게 동작하나요?

Karpenter를 사용할 때는 EC2NodeClass에 커스텀 AMI를 지정합니다.

- `amiFamily: AL2023`으로 설정하면 nodeadm 기반 부트스트랩이 자동 적용됩니다
- 커스텀 AMI를 직접 지정하려면 `amiSelectorTerms`에 AMI ID나 태그를 설정합니다
- **커스텀 AMI를 사용해도 Karpenter 설정은 달라지지 않습니다.** AMI는 노드에 설치되는 소프트웨어만 바뀔 뿐, 나머지 동작은 기본 AMI와 동일합니다

Managed Node Group과 달리, Karpenter는 노드가 `karpenter.sh/unregistered:NoExecute` taint를 가진 상태로 시작합니다. 노드가 클러스터에 정상 등록되면 이 taint가 자동으로 제거됩니다.

## 커스텀 설정이 필요할 때

노드에 추가 설정이 필요하면(kubelet 파라미터 변경 등), `/etc/eks/nodeadm.d/`에 drop-in 파일을 작성합니다.

Packer 빌드 시 스크립트에서 이렇게 할 수 있습니다.

```bash
sudo mkdir -p /etc/eks/nodeadm.d/
cat <<'NODECONFIG' | sudo tee /etc/eks/nodeadm.d/custom.yaml
apiVersion: node.eks.aws/v1alpha1
kind: NodeConfig
spec:
  kubelet:
    config:
      maxPods: 110
NODECONFIG
```

## 커스텀 AMI에서 하면 안 되는 것

- nodeadm을 삭제하거나 업데이트하지 않습니다
- kubelet, containerd 버전을 변경하지 않습니다
- `/etc/eks/` 하위 기존 설정 파일을 수정하지 않습니다

이 컴포넌트들은 EKS 버전에 맞게 사전 구성되어 있습니다. **변경하면 노드 조인이 실패할 수 있습니다.**

## 결론

EKS optimized AMI를 base로 쓰면 nodeadm이 이미 포함되어 있어서 nodeadm을 별도로 설치할 필요는 없습니다. 하지만 **커스텀 AMI를 사용할 때 NodeConfig 처리 방식은 Managed Node Group과 Karpenter가 다릅니다.**

- **Managed Node Group**: 커스텀 AMI 사용 시 AWS가 NodeConfig를 자동 주입하지 않습니다. launch template user data에 NodeConfig를 직접 넣어야 합니다. (이 프로젝트의 EKS 모듈은 `ami_id`가 설정되면 자동 생성합니다.)
- **Karpenter**: `amiFamily: AL2023`을 설정하면 Karpenter가 NodeConfig를 자체 생성합니다. 별도로 user data를 작성할 필요가 없습니다.

두 방식 모두 추가 패키지만 설치하고 EKS 핵심 컴포넌트(nodeadm, kubelet, containerd)는 건드리지 않는 것이 핵심입니다.

## 참고자료

- <https://docs.aws.amazon.com/eks/latest/userguide/al2023.html>
- <https://docs.aws.amazon.com/eks/latest/userguide/eks-optimized-ami.html>
- <https://docs.aws.amazon.com/eks/latest/userguide/launch-templates.html>
