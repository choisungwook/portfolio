# 개요
* git-clone 텍톤 파이프라인
> git clone url: https://github.com/choisungwookDevops/springboot-helloworld.git

# 조건
* 동적 프로비저닝 활성화

# 실행
* task 생성
```sh
kubectl apply -f .
```

* task 실행
```sh
tkn pipeline start springboot-demo --workspace name=source,claimName=tekton-tutorial-sources
```