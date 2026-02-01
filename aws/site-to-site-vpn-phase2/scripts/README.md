# 개요

- 이 경로에 있는 파일은 strongswang설정파일과 FRR설정파일을 도와주는 템플릿입니다.
- 이 템플릿을 사용하려면 AWS Site to Site Configuration이 필요합니다.

![site-to-site-vpn-12](../imgs/site-to-site-vpn-12.png "site-to-site-vpn-12")

## 준비: 환경변수 설정

- 템플릿은 환경변수를 사용해서 envsubst명령어로 사용하여 [vpn-env.sh](./vpn-env.sh)값을 템플릿에 대입합니다.
- 환경변수는 [vpn-env.sh](./vpn-env.sh)을 참조하여 생성합니다. [vpn-env.sh](./vpn-env.sh)의 환경변수는 AWS Site to Site Configuration의 몇번째 줄을 참조해야하는지 알 수 있습니다. 그리고 63,66번째 줄은 VPC Cidr를 입력해야 합니다.

## strongswang 설정파일 생성과 실행

envsubst명령어로 파일을 생성합니다.

```sh
envsubst < ipsec.conf.template > ipsec.conf
envsubst < ipsec.secrets.template > ipsec.secrets
envsubst '$CGW_INSIDE_IP_TUNNEL1 $VPG_INSIDE_IP_TUNNEL1 $CGW_INSIDE_IP_TUNNEL2 $VPG_INSIDE_IP_TUNNEL2' < ipsec-vti-hook.sh.template > ipsec-vti-hook.sh
```

그리고 strongswang을 실행하는 EC2인스턴스 내부에 파일을 복사합니다.

- ipsec.conf -> /etc/ipsec.conf
- ipsec.secrets -> /etc/ipsec.secrets
- ipsec-vti-hook.sh -> /etc/ipsec.d/ipsec-vti-hook.sh

/etc/ipsec.d/ipsec-vti-hook.sh에 실행권한을 추가합니다.

```sh
chmod +x /etc/ipsec.d/ipsec-vti-hook.sh
```

strongswang을 실행합니다.

```sh
systemctl restart strongswan-starter
```

## FRR 설정파일 생성

envsubst명령어로 파일을 생성하고 FRR을 실행하는 EC2인스턴스 내부에 파일을 복사합니다.

```sh
# frr설정
envsubst < frr.conf.template > frr.conf
```

frr의 bgpd을 활성화 합니다.

```sh
sed -i 's/bgpd=no/bgpd=yes/' /etc/frr/daemons
```

frr을 재실행합니다.

```sh
systemctl restart frr
```
