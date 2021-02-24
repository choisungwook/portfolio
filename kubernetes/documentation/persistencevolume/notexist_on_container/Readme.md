# 개요
* 컨테이너에 존재하지 않은 볼륨을 마운트할 때

# 실행
```sh
kubectl apply -f ./templates
```

# 삭제
```sh
kubectl delete -f ./templates
```

# 결과
* 잘 마운트 한다.
* 디렉터리가 없으면 해당 디렉터리까지 생성

![](./imgs.yaml)