# 개요
* pod replica 2개 설정과 probe 설정 예제

# 테스트 방법

* python app 배포

```sh
kubectl apply -f ./python_app/
kubectl apply -f ./netshoot/
```

* 모니터링

```sh
$ kubectl exec -it {netshot pod} -- /bin/zsh
$ (netshoot pod) while true; do curl -o /dev/null -s -w "%{http_code}\n" python-app-lazyboot/ping; sleep 0.2; done
```

* pod에 스트레스(또는 pod를 강제 종료)

```sh
$ kubectl -n default exec -it {pod_이름} -- sh
$ (pod shell)# apt update && apt install stress
# OOM error
$ (pod shell)# stress --vm 2 --vm-bytes 1024M --timeout 300s
```
