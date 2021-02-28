# 정리
* 종류: issuer, cluster issuse
* issuse는 namespace에 한정되기 때문에 cluster issuse 권장
* issuser은 let's encrypt를 사용
* ACME(Automated Certificate Management Environment)은 요청이 오면 자동으로 prviate key를 생성


# 명령어 정리
## clusterissuer 목록
```sh
kubectl get clusterissuer
```

# 참고자료
* [1] [블로그]([letsencrypt-staging](http://kimpaper.github.io/2020/05/13/kubernetes-certmanager/)