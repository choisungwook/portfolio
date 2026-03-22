# CloudFront + S3 실습 - Cache-Control 디렉티브별 동작 비교

## 목차

- [공부 배경](#공부-배경)
- [이 글을 읽고 답할 수 있는 질문](#이-글을-읽고-답할-수-있는-질문)
- [사전 준비](#사전-준비)
- [아키텍처](#아키텍처)
- [Terraform 배포](#terraform-배포)
- [실습 1: max-age vs s-maxage 비교](#실습-1-max-age-vs-s-maxage-비교)
- [실습 2: no-cache vs no-store 비교](#실습-2-no-cache-vs-no-store-비교)
- [실습 3: private](#실습-3-private)
- [리소스 삭제](#리소스-삭제)
- [결론](#결론)
- [참고자료](#참고자료)

## 이 글을 읽고 답할 수 있는 질문

1. CloudFront에서 `max-age`와 `s-maxage`는 `x-cache` 헤더에 어떤 차이를 만드는가?
2. `no-cache`와 `no-store`를 설정하면 CloudFront는 매번 Origin(S3)에서 가져오는가?
3. `private` 디렉티브를 설정하면 CloudFront는 캐시하는가, 안 하는가?
4. CloudFront 캐시 정책에서 `min_ttl=0`은 어떤 역할을 하는가?
5. Terraform으로 CloudFront + S3 환경을 어떻게 배포하는가?

## 사전 준비

AWS CLI와 Terraform이 필요합니다.

AWS CLI 설치 및 자격 증명 설정 확인 명령어입니다.

```bash
aws sts get-caller-identity
```

Terraform 버전을 확인합니다. 1.11 이상이 필요합니다.

```bash
terraform version
```

## 아키텍처

CloudFront가 S3를 Origin으로 사용하는 구조입니다.

```
Client (curl)
      │
      ▼
┌──────────────┐
│  CloudFront  │  ← 캐시 정책: Origin의 Cache-Control 존중 (min_ttl=0)
│              │  ← x-cache 헤더로 HIT/MISS 확인
└──────┬───────┘
       │  OAC (Origin Access Control)
       ▼
┌──────────────┐
│     S3       │  ← 오브젝트마다 다른 Cache-Control 메타데이터
│   (Origin)   │
└──────────────┘
```

CloudFront 캐시 정책은 `min_ttl=0`으로 설정되어 있어서, Origin이 응답하는 Cache-Control 헤더를 그대로 존중합니다. `min_ttl`이 0보다 크면 Origin의 Cache-Control 디렉티브를 무시하고 최소 TTL만큼 강제 캐시하기 때문에, 이 실습에서는 반드시 0이어야 합니다.

### S3 오브젝트별 Cache-Control 설정

S3에 업로드하는 HTML 파일 5개에 각각 다른 Cache-Control 메타데이터를 설정합니다.

| S3 오브젝트 | Cache-Control | CloudFront 동작 |
|---|---|---|
| `max-age.html` | `public, max-age=60` | CloudFront + 브라우저 모두 60초 캐시 |
| `s-maxage.html` | `public, s-maxage=60, max-age=0` | CloudFront 60초 캐시, 브라우저 매번 재검증 |
| `no-cache.html` | `no-cache` | CloudFront 매번 Origin 재검증 |
| `no-store.html` | `no-store` | CloudFront 캐시 안 함, 매번 S3 호출 |
| `private.html` | `private, max-age=60` | CloudFront 캐시 안 함, 브라우저만 캐시 |

## Terraform 배포

저장소를 클론하고 terraform 디렉터리로 이동합니다.

```bash
git clone https://github.com/choisungwook/portfolio.git
cd portfolio/computer_science/cache_control/terraform
```

Terraform을 초기화하고 배포합니다.

```bash
terraform init
terraform plan
terraform apply
```

배포가 완료되면 CloudFront 도메인을 확인합니다.

```bash
terraform output cloudfront_domain_name
```

DOMAIN 변수에 저장해 둡니다. 이후 모든 실습에서 이 변수를 사용합니다.

```bash
DOMAIN=$(terraform output -raw cloudfront_domain_name)
echo $DOMAIN
```

CloudFront 배포에는 5~10분 정도 소요됩니다. `terraform apply`가 완료되어도 CloudFront 엣지 서버에 설정이 전파되기까지 시간이 걸릴 수 있습니다. 배포 직후 요청이 실패하면 몇 분 기다린 후 다시 시도합니다.

## 실습 1: max-age vs s-maxage 비교

`max-age`와 `s-maxage`가 CloudFront 캐시 동작에 어떤 차이를 만드는지 확인합니다.

### max-age: CloudFront + 브라우저 모두 캐시

첫 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/max-age.html" -o /dev/null | grep -i "x-cache\|cache-control"
```

기대 결과입니다.

```
cache-control: public, max-age=60
x-cache: Miss from cloudfront
```

첫 요청이므로 CloudFront에 캐시가 없어서 `Miss`가 나옵니다. S3에서 직접 가져옵니다.

두 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/max-age.html" -o /dev/null | grep -i "x-cache\|cache-control"
```

기대 결과입니다.

```
cache-control: public, max-age=60
x-cache: Hit from cloudfront
```

`x-cache: Hit from cloudfront`가 나옵니다. CloudFront가 첫 번째 요청에서 받은 응답을 캐시했기 때문입니다. `max-age=60`이므로 60초 동안 CloudFront와 브라우저 모두 캐시를 사용합니다.

### s-maxage: CloudFront만 캐시, 브라우저는 매번 확인

첫 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/s-maxage.html" -o /dev/null | grep -i "x-cache\|cache-control"
```

기대 결과입니다.

```
cache-control: public, s-maxage=60, max-age=0
x-cache: Miss from cloudfront
```

두 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/s-maxage.html" -o /dev/null | grep -i "x-cache\|cache-control"
```

기대 결과입니다.

```
cache-control: public, s-maxage=60, max-age=0
x-cache: Hit from cloudfront
```

CloudFront는 `s-maxage=60`을 보고 60초 동안 캐시합니다. 따라서 두 번째 요청에서 `Hit`가 나옵니다.

**curl에서는 `max-age`와 `s-maxage` 모두 두 번째 요청에서 Hit가 나옵니다.** curl은 브라우저 캐시가 없어서 매번 CloudFront까지 요청이 도달하기 때문입니다. 진짜 차이는 브라우저에서 드러납니다. `max-age=60`은 브라우저가 60초 동안 서버에 요청 자체를 보내지 않지만, `max-age=0`은 브라우저가 매번 CloudFront에 요청을 보냅니다. CDN 캐시는 유지하면서 브라우저에는 항상 최신 데이터를 보여줘야 할 때 `s-maxage` + `max-age=0` 조합을 사용합니다.

## 실습 2: no-cache vs no-store 비교

`no-cache`와 `no-store`가 CloudFront에서 어떻게 다르게 동작하는지 확인합니다.

### no-store: 항상 Miss

첫 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/no-store.html" -o /dev/null | grep -i "x-cache"
```

기대 결과입니다.

```
x-cache: Miss from cloudfront
```

두 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/no-store.html" -o /dev/null | grep -i "x-cache"
```

기대 결과입니다.

```
x-cache: Miss from cloudfront
```

몇 번을 요청해도 항상 `Miss`입니다. `no-store`는 CloudFront가 응답을 캐시에 저장하지 않으므로 매번 S3에서 새로 가져옵니다.

### no-cache: 매번 재검증

첫 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/no-cache.html" -o /dev/null | grep -i "x-cache"
```

기대 결과입니다.

```
x-cache: Miss from cloudfront
```

두 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/no-cache.html" -o /dev/null | grep -i "x-cache"
```

기대 결과입니다.

```
x-cache: RefreshHit from cloudfront
```

`RefreshHit`는 CloudFront가 캐시에 저장된 응답을 사용하기 전에 Origin(S3)에 재검증 요청을 보냈고, 콘텐츠가 변경되지 않았음을 확인한 뒤 캐시된 응답을 반환했다는 의미입니다. 일반 `Hit`와 달리 매번 Origin에 확인 요청이 발생합니다.

`no-cache`는 캐시에 저장은 하되, 사용하기 전에 Origin에 재검증을 요청합니다. CloudFront가 S3에 조건부 요청(If-None-Match 등)을 보내서 콘텐츠가 변경되지 않았으면 캐시된 응답을 사용합니다.

**`no-store`는 "저장하지 마"이고, `no-cache`는 "저장은 하되 매번 확인해"입니다.** 개인정보나 결제 정보처럼 어디에도 남으면 안 되는 데이터에는 `no-store`, 최신 상태를 보장하면서 네트워크 비용을 줄이려면 `no-cache`를 사용합니다.

## 실습 3: private

`private` 디렉티브가 CloudFront 캐시에 어떤 영향을 주는지 확인합니다.

첫 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/private.html" -o /dev/null | grep -i "x-cache\|cache-control"
```

기대 결과입니다.

```
cache-control: private, max-age=60
x-cache: Miss from cloudfront
```

두 번째 요청을 보냅니다.

```bash
curl -s -D - "http://$DOMAIN/private.html" -o /dev/null | grep -i "x-cache\|cache-control"
```

기대 결과입니다.

```
cache-control: private, max-age=60
x-cache: Miss from cloudfront
```

몇 번을 요청해도 `x-cache: Miss from cloudfront`입니다. `private` 디렉티브는 shared cache(CDN)에 저장을 금지합니다. CloudFront는 이 응답을 캐시하지 않고, 매번 S3에서 가져옵니다.

**`private`는 "브라우저(개인 캐시)만 캐시하고, CDN은 캐시하지 마"라는 뜻입니다.** 브라우저 DevTools에서 확인하면 `max-age=60`에 따라 브라우저는 로컬에 캐시합니다(Size 컬럼에 `disk cache` 표시). 사용자별로 다른 데이터(마이페이지, 장바구니 등)에 적합한 디렉티브입니다.

## 리소스 삭제

실습이 끝나면 반드시 리소스를 삭제합니다. CloudFront + S3 조합은 요청 수에 따라 비용이 발생합니다.

```bash
cd portfolio/computer_science/cache_control/terraform
terraform destroy
```

`terraform destroy` 실행 시 확인 메시지가 나오면 `yes`를 입력합니다. CloudFront 배포 삭제에도 수 분이 소요될 수 있습니다.

## 결론

CloudFront에서 Cache-Control 디렉티브별 동작을 직접 확인해 보면, `x-cache` 헤더 하나로 CDN 캐시 HIT/MISS를 명확하게 판단할 수 있습니다. Docker 실습에서 Nginx로 확인한 것과 동일한 원리가 실제 CDN에서도 그대로 적용됩니다. 결국 핵심은 "누가 캐시하고, 언제 확인하는가"이며, `s-maxage`로 CDN과 브라우저를 분리 제어하는 전략이 실서비스에서 가장 실용적입니다.

## 참고자료

- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html>
- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control>
- <https://web.dev/articles/http-cache>
