# OAuth 2.0 핸즈온: Authorization Code Grant & PKCE

이 디렉터리의 코드는 OAuth 2.0의 핵심적인 두 가지 흐름을 직접 실습하고 이해하기 위해 만들어졌습니다. Google을 ID Provider로 사용하여 Python 기반의 웹 애플리케이션에서 다음 두 가지 주요 흐름을 시연합니다.

- Authorization Code Grant
- Authorization Code Grant with PKCE

## 목차

<!-- TOC -->

- [OAuth 2.0 핸즈온: Authorization Code Grant & PKCE](#oauth-20-%ED%95%B8%EC%A6%88%EC%98%A8-authorization-code-grant--pkce)
  - [목차](#%EB%AA%A9%EC%B0%A8)
  - [핵심 개념](#%ED%95%B5%EC%8B%AC-%EA%B0%9C%EB%85%90)
    - [Authorization Code Grant](#authorization-code-grant)
    - [PKCE Proof Key for Code Exchange](#pkce-proof-key-for-code-exchange)
  - [핸즈온 준비](#%ED%95%B8%EC%A6%88%EC%98%A8-%EC%A4%80%EB%B9%84)
    - [전제 조건](#%EC%A0%84%EC%A0%9C-%EC%A1%B0%EA%B1%B4)
    - [의존성 설치](#%EC%9D%98%EC%A1%B4%EC%84%B1-%EC%84%A4%EC%B9%98)
    - [환경 변수 설정](#%ED%99%98%EA%B2%BD-%EB%B3%80%EC%88%98-%EC%84%A4%EC%A0%95)
  - [핸즈온 실행](#%ED%95%B8%EC%A6%88%EC%98%A8-%EC%8B%A4%ED%96%89)
    - [기본 Authorization Code Grant 실행 main.py](#%EA%B8%B0%EB%B3%B8-authorization-code-grant-%EC%8B%A4%ED%96%89-mainpy)
    - [PKCE를 적용한 Authorization Code Grant 실행 code_challenge.py](#pkce%EB%A5%BC-%EC%A0%81%EC%9A%A9%ED%95%9C-authorization-code-grant-%EC%8B%A4%ED%96%89-code_challengepy)

<!-- /TOC -->

## 핵심 개념

### Authorization Code Grant

서버 사이드 애플리케이션에 권장되는 표준적인 OAuth 2.0 흐름입니다.

이 흐름에서 애플리케이션은 사용자를 인증 서버로 리디렉션하여 인증과 권한 동의를 받습니다. 완료되면 인증 서버는 `Authorization Code`를 발급하여 애플리케이션으로 다시 리디렉션합니다.

애플리케이션의 백엔드는 이 코드를 Client Secret과 함께 인증 서버로 보내 Access Token과 교환합니다. Client Secret을 안전하게 저장할 수 있는 서버 환경에 적합합니다.

### PKCE (Proof Key for Code Exchange)

모바일 앱이나 브라우저 기반의 SPA(Single Page Application)와 같이 Client Secret을 안전하게 저장할 수 없는 "Public Client"를 위한 보안 강화 확장 기능입니다.

PKCE는 `code_verifier`와 `code_challenge`라는 두 개의 추가 파라미터를 사용합니다.

1. 애플리케이션은 임의의 문자열인 `code_verifier`를 생성합니다.
2. `code_verifier`를 해시하여 `code_challenge`를 만듭니다.
3. 인증 요청 시 `code_challenge`를 함께 보냅니다.
4. 인증 서버는 `code_challenge`를 저장한 후 `Authorization Code`를 발급합니다.
5. 애플리케이션이 Access Token을 요청할 때, 원본 `code_verifier`를 함께 보냅니다.
6. 인증 서버는 전달받은 `code_verifier`를 해시하여 저장해둔 `code_challenge`와 일치하는지 검증합니다.

이 과정을 통해 중간에 `Authorization Code`가 탈취되더라도 `code_verifier`를 모르면 토큰으로 교환할 수 없으므로 보안이 강화됩니다.

## 핸즈온 준비

### 전제 조건

- Python 3.8+
- uv (의존성 관리를 위해 권장)
- Google Cloud Platform 프로젝트 및 OAuth 2.0 클라이언트 자격 증명 (자세한 내용은 상위 README 참조)

### 의존성 설치

uv를 사용하여 의존성을 설치하고 가상 환경을 활성화합니다.

```sh
uv sync
source .venv/bin/activate
```

### 환경 변수 설정

.env.example 파일을 기반으로 .env 파일을 생성하고 Google Cloud Platform에서 발급받은 클라이언트 정보를 입력합니다.

```ini
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_REDIRECT_URI="http://localhost:8080/callback"
```

## 핸즈온 실행

### 기본 Authorization Code Grant 실행 (main.py)

서버 사이드 애플리케이션의 표준 흐름을 시연합니다.

```sh
uvicorn main:app --port 8080
```

브라우저에서 http://localhost:8080으로 접속하여 Google 로그인 흐름을 시작할 수 있습니다.

![backend_1](./imgs/backend_1.png "backend_1")

![backend_2](./imgs/backend_2.png "backend_2")

![backend_3](./imgs/backend_3.png "backend_3")

### PKCE를 적용한 Authorization Code Grant 실행 (code_challenge.py)

Public Client를 위한 보안 강화 흐름을 시연합니다.

```sh
uvicorn code_challenge:app --port 8080
```

브라우저에서 http://localhost:8080/login으로 접속하여 PKCE가 적용된 Google 로그인 흐름을 시작할 수 있습니다.
