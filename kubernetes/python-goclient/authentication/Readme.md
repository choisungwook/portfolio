# 개요
로컬과 개발/운영에서 쿠버네티스 인증하는 방법을 정리

# 준비
* kubernetes(이 예제에서 rancher desktop 사용)
* kubernetes kubeconfig

# 로컬 실행방법
```sh
cd app
pip install -r requirements.txt
uvicnrom main:app --reload

curl localhost:8080/namespaces
```

# 쿠베네티스에서 실행방법
```sh
# 배포
nerdctl build --namespace k8s.io -t auth-demo:v0.0.1 -f ./deploy/Dockerfile .
cd deploy
kubectl apply -f .

# 포트포워딩
kubectl port-forward service/fastapi-auth-demo 32000:80

# namespace 목록조회
curl localhost:32000/namespaces
```