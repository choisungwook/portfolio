## 개요
* [mTLS실습](./README.md)후, wireshark로 mTLS 패킷 덤프

## 패킷 파일
* [파일링크](../../../pcap_files/mTLS_with_nginx/nginx-mtls.pcapng)

## 실습

1. wireshark 실행
2. wireshark loopback 네트워크 인터페이스 캡처

![](./imgs/wireshark-capture.png)

3. test스크립트 실행

```sh
make tests
```
