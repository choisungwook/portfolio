
# 1. 준비
## 1.1 aws cli 설치
```sh
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

## 1.2 aws configure


## 1.3 eksctl 설치
```sh
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin
```

## 1.4 kubectl 설치
```sh
curl -o kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.18.8/2020-09-18/bin/linux/amd64/kubectl
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin
```

## 1.5 ssh 키 생성
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

# 4. eks 삭제
```sh
 eksctl delete cluster  eks-demo
```

# 참고자료
* [1] ec2 instance 요금: https://aws.amazon.com/ko/ec2/spot/pricing/
* [2] spot : https://aws.amazon.com/ko/ec2/spot/instance-advisor/
* [3] eksctl 설치: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/getting-started-eksctl.html
