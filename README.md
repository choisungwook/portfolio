- [1. 자기소개](#1-자기소개)
- [2. 기술스택](#2-기술스택)
- [3. 프로젝트 목차](#3-프로젝트-목차)
  - [3.1 쿠버네티스를 이용한 개발환경 자동화 구축 프로토타입](#31-쿠버네티스를-이용한-개발환경-자동화-구축-프로토타입)
  - [3.2 aws를 이용한 뉴스 크롤링](#32-aws를-이용한-뉴스-크롤링)
- [4. 공부정리](#4-공부정리)
  - [4.1 엔지니어](#41-엔지니어)
  - [4.2 개발](#42-개발)
  - [기타](#기타)
- [기타](#기타-1)

<br>

# 1. 자기소개
안녕하세요. 현재 2년차(약 1년 2개월)로 달려가고 있는 DEVOPS엔지니어입니다. 클라우드, CI/CD, 프레임워크, 컨테이너 등 기업 DEVOPS 적용사례를 살펴보고 업무에 적용하기 위해 열심히 공부하고 있습니다. 개인공부 내용은 블로그와 유투브에 업로드하고 있습니다. 엔지니어 이외에 파이썬을 이용한 개발 즐겨하며 go언어와 go생태계를 공부할 예정입니다. 그리고 네트워크, 운영체제 등 CS지식도 꾸준히 할 예정입니다.
* 블로그: https://malwareanalysis.tistory.com
* 유투브: https://www.youtube.com/channel/UC7ctp-Pbn6y3J1VwtCtsnOQ

<br>

# 2. 기술스택
* container
  * docker
  * dockerfile
* aws
  * lambda
  * iam
  * s3
  * ivs
  * ec2
  * vpc
  * route 53
  * codedeploy
* kubernetes
* python
* 오픈소스
  * vagrant
  * springboot
  * springsecurity
  * flask
  * fastapi
  * appscheduler(python batch library)
  * argocd
  * jenkins
  * git
  * helm
* db
  * redis

<br>

# 3. 프로젝트 목차
## 3.1 쿠버네티스를 이용한 개발환경 자동화 구축 프로토타입
> 버전1 git repo: https://github.com/srmproject/server
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

# 4. 공부정리
## 4.1 엔지니어
* Docker
  * [Add와 COPY명령어 차이](https://malwareanalysis.tistory.com/233)
  * docker 이미지레이어 분석 시리즈
    * [1편 도커 이미지 레이어 구조](https://malwareanalysis.tistory.com/213)
    * [2편 Dockerfile과 이미지 레이어 관계](https://malwareanalysis.tistory.com/234)
    * [3편 빌드캐시](https://malwareanalysis.tistory.com/236)
    * [4편 빌드과정에서 일어나는 일](https://malwareanalysis.tistory.com/222)
* kubernetes
  * 쿠버네티스 네트워크 스터디(페이스북 쿠버네티스 그룹에서 스터디 모집)
    * [1주차 1편 컨테이너 격리](https://malwareanalysis.tistory.com/248)
    * [1주차 2편 네트워크 네임스페이스](https://malwareanalysis.tistory.com/249)
    * [2주차 1편 Flannel CNI](https://malwareanalysis.tistory.com/254)
    * [2주차 2편 pause 컨테이너](https://malwareanalysis.tistory.com/255)
  * helm 시작하기 시리즈
    * [1편 helm이란](https://malwareanalysis.tistory.com/193)
    * [2편 helm 설치](https://malwareanalysis.tistory.com/194)
    * [3편 helm차트 생성](https://malwareanalysis.tistory.com/195)
    * [4편 helm 차트 설치, 조회, 삭제](https://malwareanalysis.tistory.com/196)
    * [5편 helm 차트 템플릿 값 동적 수정](https://malwareanalysis.tistory.com/197)
    * [6편 values.yaml 오버라이딩](https://malwareanalysis.tistory.com/198)
    * [7편 Release Object사용](https://malwareanalysis.tistory.com/200)
    * [8편 namespace설정](https://malwareanalysis.tistory.com/201)
    * [9편 Release 업그레이드](https://malwareanalysis.tistory.com/202)
    * [10편 Rollback](https://malwareanalysis.tistory.com/203)
* [self-singed 인증서](documentation/linux_selfsigncert.md)
* [nvm으로 javascript 버전관리](https://malwareanalysis.tistory.com/145)
* [docker-mariadb 설치](https://malwareanalysis.tistory.com/140)
* [kubesrapy 온프레미스 설치](https://youtu.be/12vNy4IvF14)
* aws vpc, subnet: https://youtu.be/zG1WFhEV5x8, https://youtu.be/5zF_KXUNt-E
* [github action과 heroku를 이용한 빌드/배포 자동화](https://youtu.be/YMdwYPCyxRk)
* [프로메테스 익스포터 원리](https://youtu.be/iJyC6A38qwY)

## 4.2 개발
* 스프링부트
  * [keycloak 설치](documentation/springboot/keylcoak/keyclaok설치.md)
  * [h2 인모메리 설정](./documentation/springboot/inmemory_h2_configuration.md)
  * [Junit5 restcontroller 테스트](./documentation/springboot/junit5/restcontroller테스트.md)
  * [ResponseEntity Header추가](./documentation/springboot/ResponseEntity_addheader.md)
  * [JPA 참조](./documentation/springboot/jpa/참조.md)
  * [junit 매테스트 끝날때마다 repository 초기화](./documentation/springboot/jpa/junit5_aftereach.md)
* 스프링시큐리티
  * [filterchain](./documentation/springseucirty/filterchain.md)
  * [springsecurity-인메모리](./documentation/springseucirty/InmemoryUser.md)
  * [스프링시큐리티 강의 시리즈](https://www.youtube.com/watch?v=ewslpCROKXY&list=PL1mta2YyMpPUEidDzJ8kAxhMNhU9Is8Ky)
* flask
  * [애플리케이션 생성](./documentation/flask/create_application.md)
  * [requset_body가져오기](./documentation/flask/request_body.md)
  * [make_response로 응답수정](./documentation/flask/make_response.md)
* javascript
  * [문법정리](./documentation/javascript/Readme.md)
* vuejs
  * [vuetify 설치](./documentation/vuejs/vuetify/install.md)
  * [vuetify 컴퍼넌트](./documentation/vuejs/vuetify/required_vuetify_components.md)
  * [vuetify 페이지 추가](./documentation/vuejs/vuetify/helloworld.md)
  * [vuetify 사이드 네비게이션 메뉴와 라우터연동](./documentation/vuejs/vuetify/vlist-router.md)
## 기타
* [python-sqlalchemy](https://malwareanalysis.tistory.com/141)
* [bash쉘스크립트-변수확인](https://malwareanalysis.tistory.com/158)
* [python-input,stdin속도 비교](https://malwareanalysis.tistory.com/156)
* [springboot-h2인메모리 콘솔접속](https://malwareanalysis.tistory.com/160)

<br>

# 기타
* [추천자료 링크모음](./documentation/etc/추천자료.md)
* [UI링크모음](./documentation/etc/참고UI.md)
* [참고할 포트폴리오](./documentation/etc/다른사람포트폴리오.md)
