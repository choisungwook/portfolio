# 인증·인증서 교체·폐기·갱신 실험

- 환경: [준비와 정리](2-setup.md).
- 아래 명령은 workspace 루트에서 실행해요.
- 정상 호출 결과와 실패 원인을 구분해 기록해요. timeout이 발생했다고 인증 거부를 재현한 것은 아니에요.

## 실험 1. 정상 인증과 Memory 접근

인증서로 자격증명을 받고 Memory 이벤트를 1번 저장·조회·삭제해요.

```bash
python -m client.run
```

- 코드: [client/run.py](../client/run.py), [SDK 연결](../client/credentials.py), [Memory API](../client/memory.py).

성공하면 다음 형식으로 출력돼요. 실제 AWS 성공 로그를 미리 기록한 것은 아니에요.

```text
CREDENTIAL_PROVIDER_OK custom-process
CREATE_EVENT_OK
GET_EVENT_OK payload_matches=true
DELETE_EVENT_OK
PASS Roles Anywhere -> AgentCore Memory
```

- provider가 `custom-process`인지 확인해요.
- Memory 쓰기만으로 끝내지 않고 읽은 내용이 일치하는지와 삭제 여부까지 확인해요.
- 최초 쓰기가 성공한 뒤 조회가 실패해도 삭제를 시도해요.
- 강제 종료·삭제 실패로 남은 이벤트는 Memory 삭제 또는 7일 만료로 정리돼요.

## 실험 2. 같은 CA, 다른 CN 거부

같은 CA가 발급한 거부용 인증서와 개인 키를 선택해요.

```bash
RA_CERTIFICATE="$PWD/runtime/pki/clients/denied/client.crt" \
RA_PRIVATE_KEY="$PWD/runtime/pki/clients/denied/client.key" \
python -m client.run
```

- 예상: helper의 CreateSession이 AccessDenied로 거부되고 Memory 호출 전 종료.
- 인증서 체인은 유효하지만 CN=`other-client`가 Role trust 조건과 다르기 때문이에요.
- 이 명령의 환경변수는 1번의 실행에만 적용돼요.
- AccessDenied가 아닌 TLS·DNS·timeout 오류는 별도 문제로 조사해요.

## 실험 3. 인증서와 개인 키 교체

CN을 유지하면서 새 개인 키와 새 serial의 v2 인증서를 발급해요.

```bash
python -m scripts.rotate_certificate
```

새 인증서와 새 개인 키를 함께 선택해 Memory 접근을 확인해요.

```bash
export RA_CERTIFICATE="$PWD/runtime/pki/clients/v2/client.crt"
export RA_PRIVATE_KEY="$PWD/runtime/pki/clients/v2/client.key"
python -m client.run
```

- 예상: 정상 인증과 동일한 PASS.
- 같은 CA·CN을 유지하므로 이 교체에는 Terraform 변경이 필요하지 않아요.
- v1은 아직 유효해요. 새 버전이 성공하는지 확인한 뒤 v1 폐기로 넘어가요.
- 경로 2개 중 1개만 교체하면 인증서와 개인 키가 맞지 않아 실패해요.

## 실험 4. v1 폐기와 CRL 반영

관리 PC에서 v1을 CA 발급 DB의 폐기 목록에 넣고 CRL 파일을 생성해요.

```bash
python -m scripts.revoke_v1
```

- 이 시점에는 로컬 CA DB만 바뀌었어요. AWS에 자동으로 전달되지 않아요.
- `runtime/pki/ca/revoked.pem`은 폐기 목록 전체를 담은 서명된 PEM 파일이에요.

관리용 AWS 프로파일로 CRL을 Roles Anywhere에 등록해요.

```bash
python -m scripts.import_crl
```

- 코드: [CRL 등록](../scripts/import_crl.py). 이미 등록했다면 `python -m scripts.update_crl`을 사용해요.
- 기본 AWS provider 6.63.0에는 CRL 리소스가 없어 이 실험은 별도 boto3 관리 스크립트를 사용해요.
- CRL은 활성 상태로 등록하며, 해당 trust anchor에 연결해요.

새 프로세스에서 폐기한 v1과 유지한 v2를 각각 사용해요.

```bash
RA_CERTIFICATE="$PWD/runtime/pki/clients/v1/client.crt" \
RA_PRIVATE_KEY="$PWD/runtime/pki/clients/v1/client.key" \
python -m client.run

python -m client.run
```

- 1번째 호출: v1의 새 CreateSession 거부. 2번째 호출: 환경변수로 선택한 v2의 PASS.
- CA 공개 인증서의 로컬 검증과 AWS의 CRL 반영은 별도예요.
- 전파 지연을 고려해 제한된 횟수로 재시도해요. 거부 원인과 v2 성공을 함께 확인해요.
- v1으로 이미 발급받은 세션까지 폐기됐다는 의미는 아니에요. [기존 세션 권한 회수](4-operations.md#사고-대응과-세션-권한-회수)를 별도로 확인해요.

## 실험 5. 프로세스 1개에서 자격증명 갱신

유효한 v2를 선택한 상태에서 같은 boto3 client로 75분 동안 5분마다 이벤트를 확인해요.

```bash
python -m client.watch --minutes 75 --interval 300
```

- 코드: [client/watch.py](../client/watch.py). 갱신을 강제로 실행하거나 임시 키를 복사하지 않아요.
- 관찰 조건: CA·Leaf 유효, profile 활성, Roles Anywhere 연결 가능.
- 성공 기준: 원래 1시간 세션의 만료 시점을 지나서도 Memory 요청 성공.
- 관찰 시간 동안 CloudTrail에 새 CreateSession이 기록됐는지도 확인해요.
- 프로세스를 재시작한 결과를 자동 갱신 성공으로 세지 않아요.
- 갱신 직전 네트워크 장애·인증서 만료 상황은 별도 장애 주입 실험으로 수행해요.

## 실험 결과 기록

| 항목 | 기대 결과 | 실제 확인할 증거 |
| --- | --- | --- |
| 정상 인증 | Memory PASS | provider·조회 내용 일치 |
| 잘못된 CN | 새 인증 거부 | CreateSession 오류 유형 |
| v2 교체 | Memory PASS | 새 serial·새 키, 동일한 CN |
| v1 CRL 폐기 | v1 신규 인증 거부·v2 성공 | 활성 CRL·AWS 인증 결과 |
| 자동 갱신 | 동일 프로세스로 1시간 이후 성공 | Memory 요청·CloudTrail CreateSession |

- 기본 실습의 검증 범위는 [검증 결과](5-validation.md)에 기록해요.
