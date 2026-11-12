# 실습 환경 준비

모든 시나리오가 쓰는 환경입니다. macOS(Apple silicon)에서 AWS Emulator를 Docker로 띄우고, AWS CLI와 boto3가 emulator를 바라보게 합니다.

## 준비물

| 항목 | 확인한 버전 | 용도 |
|---|---|---|
| Docker Desktop | 29.9.2 (arm64) | emulator 실행. macOS용 설치 패키지는 없습니다 |
| AWS CLI | 2.36.29 | emulator 호출, skill 설치(2.35.0 이상 필요) |
| uv | 0.11.17 | `app/`, `probes/`의 Python 스크립트 실행 |
| 디스크 | 이미지 1.16GB | Docker 이미지 |
| 실제 AWS 자격 증명 | 선택 | 시나리오 2~4에서 실제 AWS와 비교할 때만 필요 |

## 이미지 빌드

AWS는 이미지를 배포하지 않으므로 Linux RPM을 설치하는 [docker/Dockerfile](../docker/Dockerfile)로 직접 만듭니다. Apple silicon이라 `aarch64` 패키지를 받습니다. Intel Mac이면 Dockerfile의 `aws-emulator-aarch64.rpm`을 `aws-emulator-x86_64.rpm`으로 바꿉니다.

workspace 루트(`aws/aws-emulator`)에서 실행합니다.

```bash
docker build -t aws-emulator docker/
docker run --rm aws-emulator -v
```

```text
Version: 1.0.322
Release date: 2026.11.10
Commit: 7753983c6e495ec3612695b1336bf4936fc7b7fd
```

버전은 빌드 시점의 최신 LTS라서 달라집니다. emulator는 하루에도 여러 번 release됩니다.

## up

emulator는 시작할 때마다 이번 실행에서만 쓰는 access key, 자체 서명 인증서, SDK 설정 파일을 `~/.aws/emulator/<port>/`에 씁니다. 컨테이너가 이 파일을 내 PC에 쓰도록 디렉터리를 공유합니다. `-p 127.0.0.1:9297:9297`처럼 loopback에만 열어야 같은 네트워크의 다른 PC가 접근하지 못합니다.

```bash
mkdir -p ~/.aws/emulator
docker run -d --name aws-emulator --rm --memory=2g --memory-swap=2g \
  -p 127.0.0.1:9297:9297 -e HOME="$HOME" -v "$HOME/.aws/emulator:$HOME/.aws/emulator" \
  aws-emulator -p 9297
```

health check가 `ok`를 돌려줄 때까지 기다립니다. 1초 안에 떴습니다.

```bash
for i in $(seq 30); do curl -sf --cacert ~/.aws/emulator/9297/ca.pem https://127.0.0.1:9297/__admin/health && break; sleep 1; done
```

```text
ok
```

- 시작 로그에 telemetry가 켜져 있다는 안내가 나옵니다. 끄려면 `docker run`에 `-e EMULATOR_TELEMETRY=off`를 더합니다.
- 컨테이너 안에서 `0.0.0.0`에 bind했다는 경고가 나오지만, Docker가 내 PC의 `127.0.0.1`에만 포트를 열었으므로 외부에서는 닿지 않습니다.
- 대기 중 메모리는 176MiB였습니다.

## 연결

[emulator.env](../emulator.env)는 CLI와 SDK가 emulator로 요청을 보내게 하는 환경 변수 묶음입니다. 실제 AWS 자격 증명 변수(`AWS_PROFILE` 등)를 먼저 지워서, endpoint 설정이 빠져도 실제 계정에 요청이 가지 않게 합니다. 리전은 fidelity test를 검증한 `us-west-2`로 맞췄습니다.

```bash
source emulator.env
aws sts get-caller-identity
```

```text
{
    "UserId": "AIDAH5I7GEMO7ADXNFAZU",
    "Account": "000000000000",
    "Arn": "arn:aws:iam::000000000000:user/emulator"
}
```

`Account`가 `000000000000`이면 emulator에 붙은 것입니다. 내 계정 ID가 나오면 요청이 실제 AWS로 가고 있습니다. `UserId`는 실행마다 다를 수 있습니다.

## 실제 AWS와 비교할 때

시나리오 2~4는 같은 스크립트를 실제 AWS에서도 돌립니다. emulator 변수를 지운 별도 셸에서 실행합니다. `<프로파일>`은 리소스를 만들고 지울 권한이 있는 내 AWS 프로파일입니다.

```bash
unset AWS_ENDPOINT_URL AWS_CA_BUNDLE AWS_SHARED_CREDENTIALS_FILE AWS_CONFIG_FILE
export AWS_PROFILE=<프로파일> AWS_REGION=us-west-2 AWS_DEFAULT_REGION=us-west-2
```

## down

`docker stop`으로 멈추면 `--rm` 때문에 컨테이너가 지워지고, 메모리 안의 리소스도 모두 사라집니다.

```bash
docker stop aws-emulator
```

이미지와 emulator 파일까지 지우려면 아래를 실행합니다. `~/.aws/emulator`에는 telemetry ID와 설정 파일이 있습니다.

```bash
docker image rm aws-emulator
rm -rf ~/.aws/emulator
```
