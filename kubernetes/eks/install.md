
# 1. 준비
## 1.1 aws cli 설치
## 1.2 aws configure
## 1.3 eksctl, kubectl 설치
## 1.4 ssh 키 생성
```
ssh-keygen
```

# 2. eks 설치
* --version: 버전
* --region: 설치 지역
* nodes: 설치 node 개수
* nodes-min ~ nodes-max : aws auto scale설정
* ssh-public-key: 워커노드 접속에 사용할 ssh키
 
```sh
eksctl create cluster \
    --name eks-demo \
    --version 1.18 \
    --region ap-northeast-2 \
    --nodegroup-name linux-nodes \
    --nodes 1 \
    --nodes-min 1 \
    --nodes-max 1 \
    --ssh-access \
    --ssh-public-key eks-demo.pub \
    --managed \
    --node-type t3.medium
```

# 3. 설치 확인 명령어
```
eksctl get cluster
```