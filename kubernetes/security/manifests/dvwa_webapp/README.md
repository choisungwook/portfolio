# 개요
* dvwa를 kind cluster에 배포

# 전제조건
* kind cluster
* kind nginx ingress

# 실행방법
* 배포
```bash
kubectl create ns dvwa
kubectl apply -f ./ -n dvwa
```

# 접속방법

* hosts파일에 dvwa.local 도메인 설정

```sh
127.0.0.1 dvwa.local
```

* 웹브라우저에서 dvwa.local 접속
* 로그인 비밀번호
  * 계정: admin
  * 비밀번호: password

# 삭제 방법
```bash
kubectl delete -f ./
```
