## 개요
* EKS 생성
* 아래 EKS는 저의 테스트 환경이므로, 본인이 원하는 자유롭게 EKS를 생성하시면 됩니다.

## EKS 생성 방법

1. EKS 관리 IAM role을 테라폼 변수로 설정

```bash
# AWS profile
export TF_VAR_assume_role_arn=""
```

2. 테라폼 코드 실행
```bash
terraform init
terraform plan
terraform apply # 약 15~20분 소요
````

3. kubeconfig 생성

```bash
# kubeconfig 생성
aws eks update-kubeconfig --region ap-northeast-2 --name userdata

# cluster 확인
kubectl cluster-info
```

## EKS 삭제 방법

```bash
terrform destroy
```



systemctl start ipsec

ipsec verify





```conf
conn Tunnel-1
    authby = secret
    auto = start

    #
    # 1) 구간정보
    #
    left = %defaultroute
    leftid = 3.38.191.108                # Customer Gateway(내 GW) Public IP
    right = 3.36.185.56                 # AWS VGW Public IP
    type = tunnel
    keyexchange = ike

    #
    # 2) IKE(Phase 1) 알고리즘
    #
    #  - AES-256
    #  - SHA2-256
    #  - DH Group 14 -> modp2048
    #
    ike = aes256-sha2_256;modp2048
    ikelifetime = 8h           # = 28800 seconds (AWS 기본값과 맞춤)
    keyingtries = %forever

    #
    # 3) ESP(Phase 2) 알고리즘
    #
    phase2 = esp
    phase2alg = aes256-sha2_256;modp2048
    keylife = 1h               # = 3600 seconds
    # (PFS를 위해 DH 재협상 시에도 Group 14 사용)

    #
    # 4) 서브넷 설정
    #
    #  - leftsubnet  = 온프레미스(내부) 사설망
    #  - rightsubnet = AWS VPC 측 사설망
    #
    leftsubnet = 10.10.0.0/16
    rightsubnet = 10.20.0.0/16

    #
    # 5) DPD (Dead Peer Detection) 설정
    #
    dpddelay = 10
    dpdtimeout = 30
    dpdaction = restart_by_peer

    #
    # 6) 중첩 IP(overlap IP) 가능 여부
    #    필요 시 사용 (AWS 예시 상 필요하다면)
    #
    overlapip = yes
```


Libreswan는 기본적으로 vti에 IP를 자동 할당하지 않습니다.


```conf
conn Tunnel-1
    authby=secret
    auto=start

    ikev2=never

    type=tunnel
    keyexchange=ike
    leftupdown=/etc/ipsec.d/scripts/my-vti-updown.sh

    left=%defaultroute
    leftid=3.38.191.108
    right=3.36.185.56

    ike=aes256-sha2_256;modp2048
    phase2=esp
    phase2alg=aes256-sha2_256;modp2048

    ikelifetime=8h
    keylife=1h
    keyingtries=%forever

    # ----- VTI 관련 -----
    vti-interface=vti1
    vti-routing=yes
    mark=0x64/0xffffffff

    # DPD
    dpddelay=10
    dpdtimeout=30
    dpdaction=restart_by_peer

    # Overlap IP (AWS 예시상 필요할 경우)
    overlapip=yes

```



# /etc/ipsec.d/scripts/my-vti-updown.sh
#!/bin/bash

case "$PLUTO_VERB" in
  up-client)
    # IPsec SA가 올라갈 때
    logger "VTI Up Script - $PLUTO_CONNECTION is up - adding IP"
    ip addr add 169.254.130.110/30 dev vti1
    ip link set dev vti1 up
    ;;
  down-client)
    # IPsec SA가 내려갈 때
    logger "VTI Down Script - $PLUTO_CONNECTION is down - removing IP"
    ip addr del 169.254.130.110/30 dev vti1
    ip link set dev vti1 down
    ;;
esac


apt install frr

# 참고자료
* https://hello-world.kr/15
* https://heywantodo.tistory.com/302
