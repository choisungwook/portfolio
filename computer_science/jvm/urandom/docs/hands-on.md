# 실습: /dev/random blocking 재현

kernel 4.14 인스턴스에서 entropy를 고갈시켜 JVM seed 읽기가 멈추는 것을 확인하고, `-Djava.security.egd=file:/dev/./urandom`으로 즉시 풀리는 것을 확인한다. 환경은 [실습환경 구축](./1-setup.md)을 따른다.

## 1. 재현 (legacy, kernel 4.14)

SSM으로 legacy 인스턴스에 접속해 커널과 entropy 추정치를 확인한다. kernel 4.14의 entropy_avail은 수백~4096 사이를 오간다.

```bash
uname -r                                        # 4.14.x
cat /proc/sys/kernel/random/entropy_avail
```

entropy를 고갈시키는 프로세스를 백그라운드로 띄운다. /dev/random을 계속 읽으면 blocking pool이 비워진 상태로 유지된다.

```bash
sudo su -
(while true; do dd if=/dev/random of=/dev/null bs=64 count=1 2>/dev/null; done) &
cat /proc/sys/kernel/random/entropy_avail       # 두 자리 수까지 떨어진다
```

/dev/random read가 blocking되는 것을 셸에서 먼저 확인한다. 몇 byte 나오다 멈추면 Ctrl+C로 빠져나온다.

```bash
head -c 100 /dev/random | od -An -tx1 | head
```

JVM에서 재현한다. 데모 코드를 인스턴스에 만들어 컴파일한다.

```bash
cat > SecureRandomBlockingDemo.java <<'EOF'
# app/SecureRandomBlockingDemo.java 내용을 붙여넣는다
EOF
javac SecureRandomBlockingDemo.java
```

옵션 없이 실행하면 seed를 /dev/random에서 읽다가 수십 초 이상 멈춘다. 기다리지 말고 Ctrl+C로 끊어도 된다.

```bash
java SecureRandomBlockingDemo
```

`-Djava.security.egd=file:/dev/./urandom`을 주면 즉시 끝난다.

```bash
java -Djava.security.egd=file:/dev/./urandom SecureRandomBlockingDemo
```

JDK 8은 special-case가 수정되어 점 없는 경로도 동작한다. 점이 필수였던 것은 JDK 7 이하다.

```bash
java -Djava.security.egd=file:/dev/urandom SecureRandomBlockingDemo
```

## 2. 대조 실험 (modern, kernel 6.1)

modern 인스턴스에 접속해 같은 실험을 반복한다.

```bash
uname -r                                        # 6.1.x
(while true; do dd if=/dev/random of=/dev/null bs=64 count=1 2>/dev/null; done) &
head -c 100 /dev/random | od -An -tx1 | head    # blocking 없이 즉시 출력
java SecureRandomBlockingDemo                   # 옵션 없이도 즉시 끝난다
```

kernel 5.6부터 blocking pool이 제거되어 /dev/random을 아무리 읽어도 고갈되지 않는다. entropy_avail은 CRNG 초기화 여부를 뜻하는 표시값(256)으로 고정된다.

## 3. macOS와 Docker에서 재현이 안 되는 이유 확인

로컬(macOS)에서 옛 배포판 이미지를 띄워도 커널은 호스트(Docker Desktop VM)의 것이다.

```bash
docker run --rm centos:7 uname -r               # 5.x/6.x — centos:7인데 최신 커널
docker run --rm centos:7 head -c 100 /dev/random | od -An -tx1 | head   # blocking 없음
```

container 이미지는 userland만 바꾸고 커널은 공유하므로, kernel 5.6 미만이 실제로 부팅된 머신(위의 legacy 인스턴스 같은)에서만 재현된다.
