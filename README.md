- [1. 자기소개](#1-자기소개)
- [2. 기술](#2-기술)
- [3. 공부정리](#3-공부정리)
  - [3.1 엔지니어](#31-엔지니어)
  - [3.2 개발](#32-개발)
  - [3.3 기타](#33-기타)
- [4. 외부활동](#4-외부활동)
- [5. 참고자료 정리](#5-참고자료-정리)

<br>

# 1. 자기소개
안녕하세요 2년차 데브옵스 엔지니어입니다. 온프레미스 환경에서 쿠버네티스 환경을 이용한 개발과 엔지니어링 업무를 하고 있습니다. 대표적인 프로젝트는 kaggle을 벤치마킹한 인공지능 플랫폼 개발, 약 1000명이상이 사용하는 빌드/배포 플랫폼(ArgoWorkflow, ArgoCD) 개발&운영입니다. <br>
문제를 해결할 때, 좋은 방법을 찾기 위해 자기계발을 꾸준히 하고 있습니다. 커뮤니티 활동을 좋아하고 글쓰기를 좋아하여 블로그, 유튜브를 운영하고 있습니다.
* 블로그: https://malwareanalysis.tistory.com
* 유투브: https://www.youtube.com/channel/UC7ctp-Pbn6y3J1VwtCtsnOQ

<br>

# 2. 기술
* Devops
  * Container
    * 엔진: Docker
    * 오케스트레이션 도구: Kubernetes
    * logging 시스템
      * Loki
  * 빌드/배포 도구
    * Jenkins
    * Argo Workflow
    * Argo CD
* 개발
  * 언어: Python
  * 웹 프레임워크: FastAPI
* 업무에 사용하지 않았지만 아주얉게 개인공부로 했던 것들은 ...
  * Springboot, Springsecurity
  * Vagrant
  * Aws
    * EC2, VPC, CodePipeline, S3, IVS
  * JavaScript
  * Github Action

<br>

# 3. 공부정리
개인공부 한 내용을 목차로 정리했습니다.

## 3.1 엔지니어
* Docker
  * [dockerfile Multi Stage 22.9.18](https://malwareanalysis.tistory.com/417)
  * [dockerfile 버전선택 22.8.28](https://malwareanalysis.tistory.com/410)
  * [Add와 COPY명령어 차이](https://malwareanalysis.tistory.com/233)
  * Docker 이미지레이어 분석 시리즈(21.12.25)
    * [1편 도커 이미지 레이어 구조](https://malwareanalysis.tistory.com/213)
    * [2편 Dockerfile과 이미지 레이어 관계](https://malwareanalysis.tistory.com/234)
    * [3편 빌드캐시](https://malwareanalysis.tistory.com/236)
    * [4편 빌드과정에서 일어나는 일](https://malwareanalysis.tistory.com/222)
* Kubernetes
  * [ArgoCD 시리즈 22.7 ~ 22.10](https://sungwook-choi.gitbook.io/argocd/)
  * [Kustomize 22.8.7](https://malwareanalysis.tistory.com/402)
  * [deployment 배포버전 관리 22.5.22](https://malwareanalysis.tistory.com/337)
  * [istio 공부 22.2.22 ~ 22.4.9](https://malwareanalysis.tistory.com/category/%ED%98%84%EC%9E%AC%EA%B3%B5%EB%B6%80/Istio)
  * [쿠버네티스 노드당 파드 갯수제한 확인 22.3.21](https://malwareanalysis.tistory.com/300)
  * [facebook 쿠버네티스 밋업 발표 22.3.19](https://github.com/choisungwook/facebook-meetup)
  * [KANS 쿠버네티스 네트워크 스터디 22.1 ~ 22.2](https://malwareanalysis.tistory.com/248)
  * 쿠버네티스 네트워크 스터디(페이스북 쿠버네티스 그룹에서 스터디 모집)
    * [1주차 1편 컨테이너 격리](https://malwareanalysis.tistory.com/248)
    * [1주차 2편 네트워크 네임스페이스](https://malwareanalysis.tistory.com/249)
    * [2주차 1편 Flannel CNI](https://malwareanalysis.tistory.com/254)
    * [2주차 2편 pause 컨테이너](https://malwareanalysis.tistory.com/255)
    * [3주차 calico](https://malwareanalysis.tistory.com/264)
    * [4주차 kube-proxy](https://malwareanalysis.tistory.com/265)
    * [5주차 1편 coredns](https://malwareanalysis.tistory.com/267)
    * [5주차 2편 Metal-LB](https://malwareanalysis.tistory.com/271)
    * [6주차 Ingress](https://malwareanalysis.tistory.com/277)
    * [7주차 Cilium CNI](https://malwareanalysis.tistory.com/288)
  * Helm 시작하기 시리즈(21)
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
* Aws
  * [vpc 기초정리](https://youtu.be/zG1WFhEV5x8)
  * [subnet 기초정리](https://youtu.be/5zF_KXUNt-E)
  * [임시자격증명을 이용한 다른계정 리소스 접근 22.4.18](https://youtu.be/IDiW1Ah4LJw)
  * [aws profile관리 22.4.24](https://malwareanalysis.tistory.com/317)
  * [Systems Manager를 이용한 EC2 원격쉘 접속 22.4.24](https://malwareanalysis.tistory.com/318)
* Jenkins
  * [sh 명령어 공백제거](https://malwareanalysis.tistory.com/319)
* [github action과 heroku를 이용한 빌드/배포 자동화](https://youtu.be/YMdwYPCyxRk)
* [프로메테스 익스포터 원리](https://youtu.be/iJyC6A38qwY)
* [nginx 시작](https://youtu.be/hA0cxENGBQQ)

## 3.2 개발
* Springboot
  * [keycloak 설치](documentation/springboot/keylcoak/keyclaok설치.md)
  * [h2 인모메리 설정](./documentation/springboot/inmemory_h2_configuration.md)
  * [Junit5 restcontroller 테스트](./documentation/springboot/junit5/restcontroller테스트.md)
  * [ResponseEntity Header추가](./documentation/springboot/ResponseEntity_addheader.md)
  * [JPA 참조](./documentation/springboot/jpa/참조.md)
  * [junit 매테스트 끝날때마다 repository 초기화](./documentation/springboot/jpa/junit5_aftereach.md)
  * [springboot-h2인메모리 콘솔접속](https://malwareanalysis.tistory.com/160)
* Springsecurity
  * [filterchain](./documentation/springseucirty/filterchain.md)
  * [springsecurity-인메모리](./documentation/springseucirty/InmemoryUser.md)
  * [스프링시큐리티 강의 시리즈](https://www.youtube.com/watch?v=ewslpCROKXY&list=PL1mta2YyMpPUEidDzJ8kAxhMNhU9Is8Ky)
* Python
  * [python-sqlalchemy](https://malwareanalysis.tistory.com/141)
  * [python-input,stdin속도 비교](https://malwareanalysis.tistory.com/156)
  * [default_collections](language/python/collections/default_collection.py)
  * [typing.callable을 이용한 전략패턴](python/../language/python/strategy_pattern/main.py)

## 3.3 기타
* [bash쉘스크립트-변수확인](https://malwareanalysis.tistory.com/158)
* [tmux 모든 세션제거](https://malwareanalysis.tistory.com/309)
* Nginx
  * [nginx 기초 영상녹화 22.4.9](https://youtu.be/hA0cxENGBQQ)
  * [nginx timeout에러 22.4.16](https://youtu.be/31zAw1d1qJk)

<br>

# 4. 외부활동
* 쿠버네티스 facebook 밋업 발표 - 쿠버네티스 네트워크 발전단계
* 책 집필 - 오픈소스로 알아보는 윈도우 포렌식
* 케이실드주니어 분석대응과정 수료 - 성적 우수상 수료

# 5. 참고자료 정리
* [추천자료 링크모음](./documentation/etc/추천자료.md)
* [UI링크모음](./documentation/etc/참고UI.md)
* [참고할 포트폴리오](./documentation/etc/다른사람포트폴리오.md)
