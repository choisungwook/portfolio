## 개요

* AWS Site to Site VPN를 실습했지만 실패한 예제입니다.
* 2026.2에 성공했고 성공한 예제는 아래 링크입니다.
  * [2026.2 AWS Site to Site VPN 예제](../site-to-site-vpn-phase2/)

## 실습환경

* [libreswan를 실행하는 EC2인스턴스 테라폼 모듈](../../../common/terraform_module/ec2_strongswan/)
* [nginx를 실행하는 EC2인스턴스 테라폼 모듈](../../../common/terraform_module/ec2_with_nginx/)

## 실습 순서

* VGW를 생성하기 위해 VPN public IP가 필요하다.

# 참고자료
* https://hello-world.kr/15
* https://heywantodo.tistory.com/302
* https://youtu.be/I-aN7JyMugs?feature=shared
* https://arisukarno.medium.com/connect-aws-to-on-premise-using-redundant-ipsec-vpn-tunnel-with-bgp-routing-f9ae123eb8a9

## 관련자료

* openVPN: https://github.com/choisungwook/openvpn_in_ec2
