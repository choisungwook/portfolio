# YouTube Likes Weekly Digest

YouTube 좋아요 영상을 자동으로 수집하여 Slack, Email로 주간 다이제스트를 보내는 자동화 파이프라인.

## 왜 만들었나?

- 일주일에 좋아요를 30개 넘게 누르지만, 시간이 지나면 까먹음
- 좋아요를 누르는 이유: 인사이트, 학습 자료를 즐겨찾기하거나 나만의 스타일로 정리하려는 목적
- 주간 다이제스트로 받아보면 리뷰하고 정리할 수 있음

## Architecture

```
[Google Account 1] ──┐
[Google Account 2] ──┤── YouTube Data API v3 ──> fetch_likes.py ──┬──> Slack
[Google Account N] ──┘                                            ├──> Email
                                                                  └──> JSON
```

## 디렉토리 구조

```
youtube-likes-automation/
├── README.md
├── requirements.txt
├── config.env.example          # 환경변수 템플릿
└── scripts/
    ├── fetch_likes.py          # 메인 스크립트
    └── setup_oauth.py          # OAuth 토큰 발급 도우미
```

## 설정 가이드

### 1. Google Cloud OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **APIs & Services > Library** 에서 `YouTube Data API v3` 활성화
4. **APIs & Services > Credentials** 에서 `Create Credentials > OAuth 2.0 Client ID`
   - Application type: **Desktop app**
   - 이름: 자유 (예: `youtube-likes-automation`)
5. Client ID와 Client Secret 복사

```bash
export GOOGLE_CLIENT_ID='복사한-client-id'
export GOOGLE_CLIENT_SECRET='복사한-client-secret'
```

> **OAuth 동의 화면 (Consent Screen)**: 처음 설정 시 External로 만들면 테스트 모드로 시작됨.
> 테스트 사용자에 본인 Google 계정을 추가해야 함.
> 여러 계정을 사용하려면 각 계정을 테스트 사용자에 추가.

### 2. Refresh Token 발급 (계정별)

```bash
cd youtube-likes-automation
pip install -r requirements.txt
python scripts/setup_oauth.py
```

브라우저가 열리면:
1. Google 계정으로 로그인
2. YouTube 읽기 권한 허용
3. 다음 계정도 동일하게 반복

스크립트가 `GOOGLE_ACCOUNTS_JSON` 값을 출력함.

### 3. Slack Webhook 설정

1. [Slack API Apps](https://api.slack.com/apps) 접속
2. **Create New App > From scratch**
3. App 이름과 Workspace 선택
4. **Features > Incoming Webhooks** > 활성화
5. **Add New Webhook to Workspace** > 채널 선택
6. Webhook URL 복사

```bash
export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/T.../B.../xxx'
```

### 4. Email 설정 (선택)

Gmail을 사용하는 경우:
1. [Google App Passwords](https://myaccount.google.com/apppasswords) 에서 앱 비밀번호 생성
2. 환경변수 설정:

```bash
export EMAIL_ENABLED=true
export EMAIL_FROM='your-email@gmail.com'
export EMAIL_TO='your-email@gmail.com'
export EMAIL_PASSWORD='앱-비밀번호-16자리'
```

### 5. 테스트 실행

```bash
# 알림 없이 결과만 출력
python scripts/fetch_likes.py --dry-run

# 최근 3일만 조회
python scripts/fetch_likes.py --days 3

# JSON 파일로 저장
python scripts/fetch_likes.py --output-json result.json

# 실제 Slack/Email 발송
python scripts/fetch_likes.py
```

## 자동화 방법

### Option A: GitHub Actions (권장)

`.github/workflows/youtube-likes-digest.yml` 이 이미 포함되어 있음.

**GitHub Secrets 등록 (필수)**:

| Secret Name | Value |
|-------------|-------|
| `YT_GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `YT_GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `YT_GOOGLE_ACCOUNTS_JSON` | `[{"label":"personal","refresh_token":"1//xxx"}]` |
| `YT_SLACK_WEBHOOK_URL` | Slack Webhook URL |

Repo > Settings > Secrets and variables > Actions > **New repository secret**

- 스케줄: 매주 월요일 09:00 KST (cron: `0 0 * * 1` UTC)
- 수동 실행: Actions 탭 > `YouTube Likes Weekly Digest` > `Run workflow`

### Option B: ChatGPT Custom GPT + Actions

Custom GPT에서 이 스크립트를 API로 호출하려면:

1. 이 스크립트를 Cloud Function (GCP) 또는 Lambda (AWS)로 배포
2. HTTP endpoint를 만들어 Custom GPT Action으로 등록
3. Custom GPT에서 "내 YouTube 좋아요 보여줘" 같은 명령으로 실행

### Option C: Zapier / Make.com

1. Schedule trigger (매주 월요일)
2. Webhook 또는 Code step에서 Python 스크립트 실행
3. Slack step으로 결과 전송

### Option D: Local Cron

```bash
crontab -e
# 매주 월요일 09:00 KST
0 9 * * 1 cd /path/to/youtube-likes-automation && /path/to/python scripts/fetch_likes.py
```

## 환경변수 전체 목록

`config.env.example` 참조. 주요 항목:

| 변수 | 필수 | 설명 |
|------|------|------|
| `GOOGLE_CLIENT_ID` | O | OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | O | OAuth 2.0 Client Secret |
| `GOOGLE_ACCOUNTS_JSON` | O | 계정 정보 JSON 배열 |
| `SLACK_WEBHOOK_URL` | O* | Slack Webhook URL |
| `EMAIL_ENABLED` | X | Email 발송 활성화 (`true`/`false`) |
| `DAYS_LOOKBACK` | X | 조회 기간 (기본: 7일) |
| `MAX_RESULTS_PER_ACCOUNT` | X | 계정당 최대 영상 수 (기본: 50) |

## Slack 메시지 예시

```
YouTube Liked Videos - Last 7 Days
Generated: 2026-02-22 00:00 UTC
──────────────────────────────
personal (15 videos)
  Kubernetes Gateway API Deep Dive
  channel-name  |  Liked: 02/20
  ...
work (8 videos)
  ...
──────────────────────────────
Total: 23 videos liked across 2 accounts
```

## Troubleshooting

| 문제 | 원인 | 해결 |
|------|------|------|
| `403 Forbidden` | YouTube Data API 미활성화 | Cloud Console에서 API 활성화 |
| `invalid_grant` | Refresh token 만료/취소 | `setup_oauth.py` 재실행 |
| Slack `404` | Webhook URL 잘못됨 | Slack App에서 URL 재확인 |
| 좋아요 영상 0개 | DAYS_LOOKBACK 기간 내 좋아요 없음 | `--days 30`으로 확인 |
| `Access blocked` | OAuth 동의 화면 테스트 사용자 미등록 | 테스트 사용자에 계정 추가 |
