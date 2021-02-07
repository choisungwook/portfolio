# 개요
* 워커노드 클러스터 제외

# 준비
* kubeadm이 설치필요

# 내용
* 워커노드에서 실행
* 
```sh
kubeadm reset ; 클러스터 제외
rm -rf /etc/kubernetes ; 클러스테 정보 삭제
rm -rf /etc/cni ; 클러스테 정보 삭제
```