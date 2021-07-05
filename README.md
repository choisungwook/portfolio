- [1. 기타 링크](#1-기타-링크)
- [2. 기술스택](#2-기술스택)
- [3. 프로젝트 목차](#3-프로젝트-목차)
  - [3.1 SRM 프로젝트](#31-srm-프로젝트)
  - [3.2 aws를 이용한 뉴스 크롤링](#32-aws를-이용한-뉴스-크롤링)
- [4. 학습  목차](#4-학습--목차)
  - [구버전](#구버전)

<br>

# 1. 기타 링크
* 블로그: https://malwareanalysis.tistory.com/
* 유투브: https://www.youtube.com/channel/UC7ctp-Pbn6y3J1VwtCtsnOQ
* slideshare: https://www.slideshare.net/sungwookchoi5
* 공부기록: https://github.com/choisungwook/portfolio/wiki

<br>

# 2. 기술스택
* container
* vagrant
* aws
* kubernetes
* python

<br>

# 3. 프로젝트 목차
## 3.1 SRM 프로젝트
> 버전1: https://github.com/srmproject/server

> 시연영상: https://youtu.be/ReD2_nBjko0 

> 발표자료: https://www.slideshare.net/sungwookchoi5/ss-249424125

* 주제: 쿠버네티스를 이용한 개발자 개발환경 자동화
* 진행기간: 2021.6.1 ~ 6.31
* 사용도구
  * 인프라: virtualbox
  * 인프라 구축: vagrant 
  * CI/CD: jenkins, argocd
  * 인증서관리: cert-manager
  * git저장소: gitlab
  * 개발 패키지관리: nexus
  * 도커 레지스트리: nexus

## 3.2 aws를 이용한 뉴스 크롤링
> 팀원요청으로 비공개

* 주제: lambda, s3를 이용한 뉴스 크롤링 자동화
* 진행기간: 2021.3.1 ~ 3.31
* 사용도구
  * aws lambda
  * aws codestart(codebuild, codedeploy, codepipeline)
  * aws s3
  * html, css, javascript
  * api gateway
  * cloudwatch event

<br>

# 4. 학습  목차
* kubesrapy 설치: https://youtu.be/12vNy4IvF14
* aws vpc, subnet: https://youtu.be/zG1WFhEV5x8, https://youtu.be/5zF_KXUNt-E 
* github action과 heroku를 이용한 빌드/배포 자동화: https://youtu.be/YMdwYPCyxRk
## 구버전
| 번호 | 이름 | 설명 | 링크 |
| ---- | ---- | ---- | ---- |
| 1 | aws lambda | lambda로 백엔드 기능 연습 | [Readme 링크](./aws/lambda/Readme.md) |
| 2 | aws codepipeline lambda | 1. github webhook설정을 통한 codepipeline 자동 실행 <br> 2. lambda, api gateway, role 연동 등 실행 | 팀원 요청으로 비공개 |
| 3 | kubernetes helm | prometheus, efk 등 helm 연습  | [Readme 링크](./kubernetes/helm/Readme.md) |
| 4 | kubernetes basic | 쿠버네티스 공부  | [Readme 링크](./kubernetes/basic/Readme.md) |
| 5 | terraform과 aws연동 | VPC, EC2 인스턴스 생성 등 | [Readme 링크](./aws/terraform/Readme.md) |
| 6 | DC/OS 설치 | vagrant로 DC/OS 설치 자동화 | [Readme 링크](./Dcos/install/manual/Readme.md) |
| 7 | 공부기록 | 공부노트 정리 | [Readme 링크](./documentation/Readme.md) |