- [1. 나를 소개하는 링크모음](#1-나를-소개하는-링크모음)
  - [1.1 프로필 링크모음](#11-프로필-링크모음)
- [2. 기술스택](#2-기술스택)
- [3. 프로젝트 목차](#3-프로젝트-목차)
  - [3.1 쿠버네티스를 이용한 개발환경 자동화 구축 프로토타입](#31-쿠버네티스를-이용한-개발환경-자동화-구축-프로토타입)
  - [3.2 aws를 이용한 뉴스 크롤링](#32-aws를-이용한-뉴스-크롤링)
- [4. 공부정리](#4-공부정리)
  - [4.1 개발](#41-개발)
  - [스프링부트](#스프링부트)
  - [스프링시큐리티](#스프링시큐리티)
  - [flask](#flask)
  - [javascript](#javascript)
  - [vuejs](#vuejs)
  - [기타](#기타)
  - [4.2 엔지니어](#42-엔지니어)
- [기타](#기타-1)

<br>

# 1. 나를 소개하는 링크모음
## 1.1 프로필 링크모음
* 블로그: https://malwareanalysis.tistory.com
* 유투브: https://www.youtube.com/channel/UC7ctp-Pbn6y3J1VwtCtsnOQ

<br>

# 2. 기술스택
* container
* vagrant
* aws
* kubernetes
* python

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
## 4.1 개발
## 스프링부트
* [keycloak 설치](documentation/springboot/keylcoak/keyclaok설치.md)
* [h2 인모메리 설정](./documentation/springboot/inmemory_h2_configuration.md)
* [Junit5 restcontroller 테스트](./documentation/springboot/junit5/restcontroller테스트.md)
* [ResponseEntity Header추가](./documentation/springboot/ResponseEntity_addheader.md)
* JPA
  * [JPA 참조](./documentation/springboot/jpa/참조.md)
  * [junit 매테스트 끝날때마다 repository 초기화](./documentation/springboot/jpa/junit5_aftereach.md)
## 스프링시큐리티
* [filterchain](./documentation/springseucirty/filterchain.md)
* [springsecurity-인메모리](./documentation/springseucirty/InmemoryUser.md)
* [스프링시큐리티 강의 시리즈](https://www.youtube.com/watch?v=ewslpCROKXY&list=PL1mta2YyMpPUEidDzJ8kAxhMNhU9Is8Ky)
## flask
* [애플리케이션 생성](./documentation/flask/create_application.md)
* [requset_body가져오기](./documentation/flask/request_body.md)
* [make_response로 응답수정](./documentation/flask/make_response.md)
## javascript
* [문법정리](./documentation/javascript/Readme.md)
## vuejs
* [vuetify 설치](./documentation/vuejs/vuetify/install.md)
* [vuetify 컴퍼넌트](./documentation/vuejs/vuetify/required_vuetify_components.md)
* [vuetify 페이지 추가](./documentation/vuejs/vuetify/helloworld.md)
* [vuetify 사이드 네비게이션 메뉴와 라우터연동](./documentation/vuejs/vuetify/vlist-router.md)
## 기타
* [python-sqlalchemy](https://malwareanalysis.tistory.com/141)
* [bash쉘스크립트-변수확인](https://malwareanalysis.tistory.com/158)
* [python-input,stdin속도 비교](https://malwareanalysis.tistory.com/156)
* [springboot-h2인메모리 콘솔접속](https://malwareanalysis.tistory.com/160)

## 4.2 엔지니어
* Docker
  * [Add와 COPY명령어 차이](https://malwareanalysis.tistory.com/233)
* [self-singed 인증서](documentation/linux_selfsigncert.md)
* [nvm으로 javascript 버전관리](https://malwareanalysis.tistory.com/145)
* [docker-mariadb 설치](https://malwareanalysis.tistory.com/140)
* [kubesrapy 온프레미스 설치](https://youtu.be/12vNy4IvF14)
* aws vpc, subnet: https://youtu.be/zG1WFhEV5x8, https://youtu.be/5zF_KXUNt-E
* [github action과 heroku를 이용한 빌드/배포 자동화](https://youtu.be/YMdwYPCyxRk)
* [프로메테우스 익스포터 원리](https://youtu.be/iJyC6A38qwY)

<br>

# 기타
* [추천자료 링크모음](./documentation/etc/추천자료.md)
* [UI링크모음](./documentation/etc/참고UI.md)
* [참고할 포트폴리오](./documentation/etc/다른사람포트폴리오.md)
