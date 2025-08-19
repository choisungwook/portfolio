# 개요

* 이 예제는 kubeflow 다중 사용자

## 다중 사용자 이란?

* kubeflow 사용자를 생성하는 예제입니다.
* kubeflow는 profile라는 개념으로 사용자를 관리합니다.
* kubeflow는 인증/인가를 구현하지 않고 있는 기능을 활용하기만 합니다. 인증은 dex 오픈소스에 위임하고, 권한은 kubernetes(role, rolebinding)에게 위임합니다.

## profile 조회

```sh
$ kubectl get profile
NAME                        AGE
kubeflow-user-example-com   14d

$ kubectl get profile -oyaml
apiVersion: kubeflow.org/v1
kind: Profile
metadata:
  name: kubeflow-user-example-com
spec:
  owner:
    kind: User
    name: user@example.com
```

## profile 생성

* profile 생성

```sh
kubectl apply -f ./test_user.yaml
```

* profile 조회

```sh
$ kubectl get profile
NAME                        AGE
kubeflow-user-example-com   14d
test-user                   6h19m
```

## profile 비밀번호 설정

* profile을 생성하더라도 인증은 dex 오픈소스가 담당하므로, dex 오픈소스에 비밀번호를 설정해야 합니다.
* kubeflow 기본 예제는 dex staticPassword를 사용하여 비밀번호를 관리하고 있습니다. 운영환경에서는 staticPassword를 사용하지 않고 SSO와 연동하는 것을 권장합니다.
* 기본 예제의 user@example.com 사용자 비밀번호는 아래처럼 설정할 수 있습니다.

```sh
$ kubectl -n auth get cm dex -o yaml
apiVersion: v1
kind: ConfigMap
data:
  config.yaml: |
    issuer: http://dex.auth.svc.cluster.local:5556/dex
    staticPasswords:
    - email: user@example.com
      hashFromEnv: DEX_USER_PASSWORD
      username: user
      userID: "15841185641784"
```

* 비밀번호 생성

```sh
# bcrypt 해시 생성 (계정: test-user 비밀번호 "testtest")
htpasswd -bnBC 10 "test-user" testtest | cut -d ':' -f 2 | sed 's/2y/2a/'
```

* dex configmap 수정

```sh
$ kubectl -n auth edit cm dex
- email: test-user@example.com
  hash: {생성된해시값}
  username: test-user
```

* dex pod 재시작

```sh
kubectl rollout restart deployment dex -n auth
```

## 참고자료

* https://yjwang.tistory.com/69
