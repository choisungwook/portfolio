- [1. 개요](#1-개요)
- [2. Dockerfile 빌드](#2-dockerfile-빌드)
- [3. 컨테이너 실행](#3-컨테이너-실행)
  - [3.1 기본 컨테이너 생성](#31-기본-컨테이너-생성)
  - [3.2 메모리 제한 컨테이너 생성](#32-메모리-제한-컨테이너-생성)
- [4. Dockrefile 설정 상세내용](#4-dockrefile-설정-상세내용)
  - [4.1 설치 목록](#41-설치-목록)
  - [4.2 기본 템플릿](#42-기본-템플릿)
  - [4.3 jenkins 도커 사용 권한 설정](#43-jenkins-도커-사용-권한-설정)
  - [4.4 jenkins 플러그인 설치](#44-jenkins-플러그인-설치)
- [5. 참고자료](#5-참고자료)

<br>

> 주의: root권한으로 젠킨스 실행(nvm명령어 실행때문에..)

# 1. 개요
* 젠킨스 컨테이너에서 호스트 컨테이너 생성

<br>

# 2. Dockerfile 빌드
```sh
docker build -t [이미지 이름] .
```

<br>

# 3. 컨테이너 실행
## 3.1 기본 컨테이너 생성
* 타임존을 한국으로 변경
```sh
docker run -d -p 8080:8080 -p 50000:50000 -v /var/run/docker.sock:/var/run/docker.sock -v /home/vagrant/workspace:/var/jenkins_home --env "TZ=Asia/Seoul" [빌드된 도커 이미지]
```

## 3.2 메모리 제한 컨테이너 생성
```
docker run -d -p 8080:8080 -p 50000:50000 /var/run/docker.sock -v /home/vagrant/workspace:/var/jenkins_home --env "TZ=Asia/Seoul" --env JAVA_OPTS="-Xmx8192m -Xms8192m" [빌드된 도커 이미지]
```

<br>

# 4. Dockrefile 설정 상세내용
## 4.1 설치 목록
* docker
* jd8
* maven
* npm
* nodejs
* jenkins plugins

## 4.2 기본 템플릿
* [공식 git 문서](https://github.com/jenkinsci/docker)에 언급되어 있는 템플릿 사용
```Dockerfile
FROM jenkins/jenkins:lts
# if we want to install via apt
USER root
RUN apt-get update && apt-get install -y ruby make more-thing-here
# drop back to the regular jenkins user - good practice
USER jenkins
```

* 젠킨스 baseImage: jenkins:2.46.2

## 4.3 jenkins 도커 사용 권한 설정
* docker group에 jenkins user추가
```sh
usermod -aG docker jenkins
```

## 4.4 jenkins 플러그인 설치
* jenkins-plugin-cli 명령어를 사용해서 플러그인 설치
* 설치 플러그인 목록은 plugins.txt에 설정
```
jenkins-plugin-cli --plugin-file plugins.txt
```

<br>

# 5. 참고자료
* [1] [젠킨스 공식 git](https://github.com/jenkinsci/docker)
* [2] [젠킨스 공식문서-플러그인 관리](https://www.jenkins.io/doc/book/managing/plugins/)
* [3] [젠킨스 공식문서-설치](https://www.jenkins.io/doc/book/installing/docker/)
* [4] [블로그-젠킨스 커스텀 Dockerfile](https://coding-start.tistory.com/329)
* [5] [젠킨스 공식 dockerhub](https://hub.docker.com/r/jenkins/jenkins)
* [6] [블로그-젠킨스 리소스 제한 환경변수 설정](https://technology.riotgames.com/news/putting-jenkins-docker-container)
* [7] [젠킨스 공식문서-언어설정](https://www.jenkins.io/doc/book/using/using-local-language/)