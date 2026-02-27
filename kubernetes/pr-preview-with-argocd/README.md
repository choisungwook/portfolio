# 요약

* 인프랩 기술 블로그의 "PR Preview 환경 구축" 글을 kind cluster에서 테스트하는 실습자료입니다
* **ArgoCD ApplicationSet의 Pull Request Generator를 사용하면 PR별로 독립된 Preview 환경을 자동으로 만들 수 있습니다**
* GitHub PR에 `preview` 라벨을 붙이면 환경이 생성되고, PR을 닫으면 자동으로 삭제됩니다
* 이 실습에서는 EKS 대신 kind cluster를 사용합니다 (Linkerd는 제외)

# 목차

* [배경](#배경)
* [PR Preview란?](#pr-preview란)
* [동작 원리](#동작-원리)
* [사전 준비](#사전-준비)
* [디렉토리 구조](#디렉토리-구조)
* [실습](#실습)
* [검증 방법](#검증-방법)
* [정리](#정리)
* [참고자료](#참고자료)

# 배경

인프랩 기술 블로그에서 PR Preview 환경 구축 글을 읽었습니다. 글의 핵심 문제는 이렇습니다.

QA 환경이 하나뿐이면 병목이 발생합니다. 기능 A를 테스트하는 중에 기능 B를 배포하려면, A 테스트가 끝날 때까지 기다리거나 덮어씌워야 합니다. 팀원들은 "누가 언제 개발 환경을 쓸지" 매번 이야기해야 했습니다.

**인프랩은 "PR별로 독립된 테스트 환경을 자동으로 만들자"는 목표를 세웠습니다.**

인프랩은 ArgoCD ApplicationSet + Linkerd 조합으로 이 문제를 해결했습니다. 이 실습에서는 핵심인 ArgoCD ApplicationSet 부분만 kind cluster에서 테스트합니다.

# PR Preview란?

PR Preview는 두 단어를 합친 개념입니다. PR + Preview

1. **PR(Pull Request)**: GitHub에서 코드 변경을 리뷰하기 위해 생성하는 요청
2. **Preview**: 변경사항을 미리 확인할 수 있는 환경

**PR Preview는 PR마다 독립된 환경을 자동으로 생성하여, 코드 변경사항을 격리된 환경에서 테스트할 수 있게 하는 것입니다.**

# 동작 원리

## ArgoCD ApplicationSet이 뭘까?

ArgoCD ApplicationSet은 ArgoCD Application을 동적으로 생성하는 리소스입니다. 여러 generator를 지원하는데, 그중 Pull Request Generator가 핵심입니다.

## Pull Request Generator는 어떻게 동작할까?

동작 흐름은 다음과 같습니다.

1. Pull Request Generator가 GitHub API를 주기적으로 polling합니다 (이 실습에서는 60초)
2. `preview` 라벨이 붙은 PR을 감지합니다
3. PR마다 ArgoCD Application을 자동 생성합니다
4. PR별로 독립 namespace가 생성됩니다 (예: `preview-feature-login-42`)
5. `syncPolicy.automated`로 자동 배포됩니다
6. PR이 닫히면 Application과 namespace가 자동으로 삭제됩니다

정리하면, **개발자는 PR에 라벨만 붙이면 되고, 나머지는 ArgoCD가 알아서 처리합니다.**

## ApplicationSet YAML 핵심 설정

```yaml
generators:
- pullRequest:
    github:
      owner: <GITHUB_OWNER>
      repo: <GITHUB_REPO>
      tokenRef:
        secretName: github-token
        key: token
      labels:
      - preview
    requeueAfterSeconds: 60
```

`labels`에 `preview`를 지정했기 때문에, preview 라벨이 붙은 PR만 대상입니다. 모든 PR에 환경을 만들면 리소스 낭비가 심하기 때문입니다.

template에서는 PR 메타데이터를 변수로 사용할 수 있습니다.

| 변수 | 설명 | 예시 |
|---|---|---|
| `{{.branch_slug}}` | 브랜치 이름 (slug) | `feature-login` |
| `{{.number}}` | PR 번호 | `42` |
| `{{.head_sha}}` | 최신 커밋 SHA | `abc1234...` |
| `{{.head_short_sha}}` | 짧은 커밋 SHA | `abc1234` |

# 사전 준비

| 도구 | 용도 |
|---|---|
| kind | 로컬 Kubernetes 클러스터 |
| kubectl | Kubernetes CLI |
| helm | ArgoCD 설치 |
| GitHub PAT | Pull Request Generator가 GitHub API 호출할 때 사용 (repo scope 필요) |

# 디렉토리 구조

```
kubernetes/pr-preview-with-argocd/
├── README.md
├── setup.sh                     # 전체 셋업 스크립트
├── cleanup.sh                   # 정리 스크립트
├── kind-cluster/
│   └── kind-config.yaml         # Kind 클러스터 설정
├── argocd/
│   ├── install.sh               # ArgoCD 설치 스크립트
│   └── values.yaml              # ArgoCD Helm values
├── sample-app/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── namespace.yaml
│       ├── deployment.yaml
│       └── service.yaml
└── applicationset/
    ├── pr-preview-appset.yaml   # ApplicationSet (Pull Request Generator)
    └── github-token-secret.yaml # GitHub Token Secret
```

# 실습

## 1단계: kind 클러스터 생성

```bash
kind create cluster --config kind-cluster/kind-config.yaml
```

ArgoCD 대시보드 접속을 위해 30080, 30443 포트를 호스트에 매핑합니다.

## 2단계: ArgoCD 설치

```bash
bash argocd/install.sh
```

설치가 완료되면 접속 정보가 출력됩니다.

## 3단계: GitHub Token Secret 생성

```bash
kubectl create secret generic github-token \
  --namespace argocd \
  --from-literal=token=<YOUR_GITHUB_TOKEN>
```

GitHub Personal Access Token은 `repo` scope가 필요합니다. Pull Request Generator가 GitHub API를 호출할 때 이 토큰을 사용합니다.

## 4단계: ApplicationSet 설정 수정

`applicationset/pr-preview-appset.yaml`에서 아래 값을 실제 GitHub 저장소 정보로 변경합니다.

```yaml
owner: <GITHUB_OWNER>    # GitHub 계정 또는 organization
repo: <GITHUB_REPO>      # 저장소 이름
```

`repoURL`도 함께 변경합니다.

```yaml
repoURL: 'https://github.com/<GITHUB_OWNER>/<GITHUB_REPO>.git'
```

## 5단계: ApplicationSet 배포

```bash
kubectl apply -f applicationset/pr-preview-appset.yaml
```

## 6단계: PR 생성 후 preview 라벨 추가

GitHub 저장소에서 PR을 생성하고 `preview` 라벨을 추가합니다. 60초 이내에 ArgoCD가 PR을 감지하고 preview 환경을 자동으로 생성합니다.

## 한번에 실행하기

setup.sh를 사용하면 1~5단계를 한번에 실행할 수 있습니다.

```bash
export GITHUB_TOKEN=<YOUR_GITHUB_TOKEN>
bash setup.sh
```

# 검증 방법

## ArgoCD 대시보드에서 확인

브라우저에서 `https://localhost:30443`에 접속합니다.

초기 admin 비밀번호는 아래 명령어로 확인합니다.

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

PR에 preview 라벨을 붙이면 `preview-{branch}-{pr-number}` 형태의 Application이 생성된 것을 확인할 수 있습니다.

## CLI로 확인

```bash
# ArgoCD Application 목록 확인
kubectl get applications -n argocd

# preview namespace 확인
kubectl get namespaces | grep preview

# preview 환경의 pod 확인
kubectl get pods -n preview-<branch>-<pr-number>
```

## PR을 닫으면?

PR을 닫거나 merge하면 ArgoCD가 자동으로 Application을 삭제합니다. namespace와 그 안의 리소스도 함께 정리됩니다.

# 정리

```bash
bash cleanup.sh
```

kind 클러스터를 삭제합니다.

# 주의사항

* 이 실습은 ArgoCD ApplicationSet의 Pull Request Generator 동작을 테스트하는 것이 목적입니다
* 인프랩 원본 글에서는 Linkerd를 사용한 트래픽 라우팅도 포함되어 있지만, 이 실습에서는 제외했습니다
* GitHub Token은 repo scope가 필요합니다. public 저장소라도 rate limit 때문에 토큰을 사용하는 것을 권장합니다
* `requeueAfterSeconds: 60`으로 설정했기 때문에, PR 라벨 추가 후 최대 60초 후에 환경이 생성됩니다

# 참고자료

* https://tech.inflab.com/20251121-pr-preview/
* https://argo-cd.readthedocs.io/en/latest/operator-manual/applicationset/Generators-Pull-Request/
