# 개요
* 비대칭키(공개키와 개인키) 이용한 암호화와 복호화
* 암호화와 복호화는 암호학 지식이 필요

# 키쌍 생성
* 현재 경로에서 mykey.pub(공개키)와 mykey(비밀키)가 생성

```sh
$ ssh-keygen -t rsa -b 4096 -C "your.email@example.com" -f mykey
$ ls
mykey.pub mykey
```

# PEM포맷으로 변경

```sh
# 공개키 변환
ssh-keygen -e -m PEM -f mykey.pub > mykey_pub.pem

# 개인키 변환
ssh-keygen -p -m PEM -f ./mykey
```

# 암호화

```sh
openssl pkeyutl -encrypt -inkey mykey_pub.pem -pubin -in plaintext.txt -out encrypted.txt
```

# 복호화

```sh
openssl pkeyutl -decrypt -inkey ./mykey -in encrypted.txt -out decryption.txt
```

# 다음 내용
* [ssh vs telnet](../ssh_vs_telnet/)

# 참고자료
* RFC 4716/SSH2 공개 키 형식 표준: https://datatracker.ietf.org/doc/html/rfc4716
* https://github.blog/security/application-security/improving-git-protocol-security-github/
* https://www.cloudflare.com/ko-kr/learning/access-management/what-is-ssh/
* PKCS 포맷: https://en.wikipedia.org/wiki/PKCS_8
* https://sereysethy.github.io/encryption/2017/10/23/encryption-decryption.html
