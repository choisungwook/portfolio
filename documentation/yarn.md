- [캐시 디렉터리](#캐시-디렉터리)
- [centos8 nodejs 재설치](#centos8-nodejs-재설치)
- [build 메모리 제한](#build-메모리-제한)
- [빌드 (힙)메모리 제한](#빌드-힙메모리-제한)

# 캐시 디렉터리
```sh
yarn cache dir
```

<br>

# centos8 nodejs 재설치
> 참고자료: https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-centos-8
```yarn
yum remove -y nodejs
dnf module reset nodejs
dnf module enable nodejs:12
dnf install nodejs
npm install -g yarn
```

<br>

# build 메모리 제한
* package.json 디펜더시
```json
 "increase-memory-limit": "^1.0.3",
```

<br>

# 빌드 (힙)메모리 제한
```sh
export NODE_OPTIONS=--max_old_space_size=4096
```