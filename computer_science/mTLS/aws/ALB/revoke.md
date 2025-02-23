## 개요

* openssl revoke 설명

## index.txt (CA 데이터베이스)

* CA가 발급한 인증서 목록을 관리하는 DB(텍스트 파일)입니다.
* 발급된 인증서(Serial, 발급일, 만료일, Subject 등)가 한 줄씩 기록됩니다.
* 인증서가 폐기(Revoke)되면, 해당 라인 앞쪽에 R 표시가 추가되고, * revokeDate, CRLReason 등이 기록됩니다.
* openssl ca -revoke ... 명령이 실행될 때, 이 index.txt 파일이 갱신됩니다.

## crlnumber (CRL 시리얼 관리용)

* CRL을 새로 생성할 때(openssl ca -gencrl ...) 사용되는, 다음 CRL 발행 시리얼 번호를 저장하는 파일입니다.
* CRL을 한 번 만들 때마다 이 번호가 하나씩 증가합니다.

## root_ca.crl (Certificate Revocation List, CRL)

* 실제로 폐기된 인증서 목록이 들어 있는 파일입니다.
* AWS ALB 같은 곳에서 mTLS 설정 시 이 CRL을 등록해 두면, 목록에 포함된 인증서들을 거부할 수 있습니다.
