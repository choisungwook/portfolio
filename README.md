<!-- TOC -->

- [개요](#%EA%B0%9C%EC%9A%94)
- [자기소개](#%EC%9E%90%EA%B8%B0%EC%86%8C%EA%B0%9C)
- [목차](#%EB%AA%A9%EC%B0%A8)
- [다른 정리된 문서 링크](#%EB%8B%A4%EB%A5%B8-%EC%A0%95%EB%A6%AC%EB%90%9C-%EB%AC%B8%EC%84%9C-%EB%A7%81%ED%81%AC)

<!-- /TOC -->

## 개요

* 제가 공부한 것과 테스트한 자료를 정리한 github repo입니다.

## 자기소개

안녕하세요 데브옵스 엔지니어 악분 입니다.

* 링크드인: https://www.linkedin.com/in/choisungwook/
* 블로그: https://malwareanalysis.tistory.com
* 유투브(악분일상): https://www.youtube.com/channel/UC7ctp-Pbn6y3J1VwtCtsnOQ

## 목차

1. helm-charts - [링크](./helm)
2. eks 예제 - [링크](./eks)
3. 템플릿 - [링크](./template)
4. 우아한 종료 - [링크](./prestop/)
5. pod 안정성을 높이는 설정 - [링크](./pod-stability-manifests/)
6. coredns trailling dot(.) - [링크](./stress-coredns/)
7. pod가 persistence volume size보다 크게 사용해도 잘 동작 - [링크](./storage/over_size/)
8. 쿠버네티스 security - [링크](./security/)
9. statefulset + downward API - [링크](./statefulset_podname/)
10. statefulset 운영 - [링크](./operate_statefulset/)
11. control plane이 장애 났을 때 kubelet 로그 - [링크](./kubernetes/api-server-failure/)
12. eksctl로 EKS 설치 - [링크](./kubernetes/eks/eksctl/)
13. EKS automode - [링크](./kubernetes/eks/automode/)
14. pod Readiness Gate about - [링크](./kubernetes/eks/ALB_readiness_gate/)
15. EKS AMI에 user data 추가 - [링크](./kubernetes/eks/eks_ami_with_userdata/)
16. karpenter on-demand:spot 비율 설정 - [링크](./kubernetes/eks/karpenter/ratio_ondemand_and_spot/)
17. 쿠버네티스 node 헬스체크(lease API) 실패 - [링크](./kubernetes/leaseAPI/)
18. 쿠버네티스 node not ready일때 일어나는 일 - [링크](./kubernetes/node_not_ready/)
19. nginx mTLS 예제 - [링크](./computer_science/mTLS/nginx/)
20. nginx mTLS pcap파일 - [링크](./pcap_files/mTLS_with_nginx/)
21. AWS ALB mTLS 예제 - [링크](./computer_science/mTLS/aws/ALB/)
22. mysql 도커 컨테이너에서 sakila 샘플 로드 - [링크](./common/mysql_sakila_sample/)
23. docker 컨테이너로 BGP 프로토콜 실습 - [링크](./computer_science/BGP_protocol/)
24. k6를 사용하여 Firebase-admin SDK 메모리 사용률 비교 - [링크](./backend/firebase-fcm/)
25. docker compose로 k6, influxDB v2 구축 - [링크](./tools/k6/)
26. k6 influxDB v2 플러그인 설치와 실행 방법 - [링크](./tools/k6/influxdb_v2.md)
27. RDMS index 있고 없고 차이 비교 - [링크](./computer_science/database_index/)
28. springboot Readiness, Liveness 설정 - [링크](./backend/readiness/src/main/resources/application.yaml)
29. 도구 - sysbench(데이터베이스 등 벤치마크) - [링크](./tools/sysbench/)
30. kubernets mysql single instance - [링크](./common/kubernetes_mysql_single_instance/)
31. EKS GPU 설정과 cuda 샘플 실행 - [링크](./kubernetes/eks/gpu_node/)
32. 모니터링 방법론 USE method and RED method - [링크](./computer_science/red_and_use_method/)
33. springboot with prometheus metrics endpoint - [링크](./backend/spring-helloworld-with-prometheus/)
34. RDS CPU 사용률 60%이상, ALB error rate 10%이상 기반 cloudwatch alarm - [링크](./aws/cloudwatch_alarm_and_slack/)
35. open WEB UI와 ollama를 사용하여 쿠버네티스 환경에서 사내 데이터과학자 만든 AI모델을, 사내에서 같이 사용할 수 있는 방법을 설명 - [링크](./mlops/mcp_and_openwebui/)
36. keras와 minist 예제 - [링크](./mlops/training_examples/minist_with_keras/)
37. kubeflow 예제 - [링크](./mlops/kubeflow/)
38. AWS ASG 예제 - [링크](./aws/auto_scaling_group/examples/01_basic/)
39. AWS ASG RollingUpdate 배포 예제 - [링크](./aws/auto_scaling_group/examples/02_rollingupdate/)
39. AWS ASG Canary 배포 예제 - [링크](./aws/auto_scaling_group/examples/02_canary/)

## 다른 정리된 문서 링크

* [facebook 쿠버네티스 커뮤니티 발표](https://github.com/choisungwook/terraform_practice)
* [AWS 2024 Seoul Summit 발표 IPv6예제](https://github.com/choisungwook/aws_ipv6)
* [ArgoCD 예제](https://github.com/choisungwook/argocd-practice)
* [테라폼 예제](https://github.com/choisungwook/terraform_practice)
* [karpenter](https://github.com/choisungwook/karpenter)
* [EKS 예제](https://github.com/choisungwook/eks-practice)
* [스터디]
  * [ansible](https://github.com/choisungwook/ansible_practice)
  * [테라폼](https://github.com/sungwook-practice/t101-study)
