# 색상 팔레트 모음

## 왜 팔레트를 정해두나

AI agent가 슬라이드를 만들 때마다 색상을 즉흥적으로 고르면 일관성이 없다. 검증된 팔레트 중 하나를 선택하면 매번 안정적인 결과를 얻을 수 있다.

## 팔레트 구조

각 팔레트는 8가지 역할(role)로 구성된다. CSS 변수명은 모든 레이아웃에서 동일하게 사용한다.

| 역할 | CSS 변수 | 용도 |
|------|----------|------|
| primary | `--primary` | 제목, 강조, 핵심 색상 |
| secondary | `--secondary` | 부제목, 보조 강조 |
| background | `--background` | 슬라이드 배경 |
| surface | `--surface` | 카드, 도형 배경 |
| text | `--text` | 본문 텍스트 |
| text-secondary | `--text-secondary` | 부가 설명, 캡션 |
| accent | `--accent` | 아이콘, 포인트 색상 |
| border | `--border` | 구분선, 테두리 |

## 라이트 팔레트

### Clean Blue (공부용 기본)

기술 문서, 스터디 노트에 적합한 깔끔한 블루 계열.

| 역할 | 색상 코드 | 미리보기 |
|------|-----------|----------|
| primary | `#2563EB` | 🔵 |
| secondary | `#7C3AED` | 🟣 |
| background | `#FFFFFF` | ⬜ |
| surface | `#F8FAFC` | |
| text | `#1E293B` | |
| text-secondary | `#64748B` | |
| accent | `#F59E0B` | 🟡 |
| border | `#E2E8F0` | |

### Corporate Navy (C-Level 기본)

임원 보고, 공식 발표에 적합한 차분한 네이비 계열.

| 역할 | 색상 코드 | 미리보기 |
|------|-----------|----------|
| primary | `#1E3A5F` | 🔵 |
| secondary | `#059669` | 🟢 |
| background | `#FFFFFF` | ⬜ |
| surface | `#F8FAFC` | |
| text | `#0F172A` | |
| text-secondary | `#475569` | |
| accent | `#DC2626` | 🔴 |
| border | `#E2E8F0` | |

### Warm Neutral (비교/분석용)

중립적인 톤으로 콘텐츠에 집중하게 하는 팔레트.

| 역할 | 색상 코드 | 미리보기 |
|------|-----------|----------|
| primary | `#6366F1` | 🟣 |
| background | `#FFFFFF` | ⬜ |
| surface | `#F8FAFC` | |
| text | `#1E293B` | |
| text-secondary | `#64748B` | |
| accent-green | `#22C55E` | 🟢 |
| accent-red | `#EF4444` | 🔴 |
| border | `#E2E8F0` | |

## 다크 팔레트

### Midnight Indigo (커뮤니티 발표용 기본)

컨퍼런스 발표에 적합한 어두운 배경 + 선명한 강조색.

| 역할 | 색상 코드 | 미리보기 |
|------|-----------|----------|
| primary | `#6366F1` | 🟣 |
| secondary | `#EC4899` | 🩷 |
| background | `#0F172A` | ⬛ |
| surface | `#1E293B` | |
| text | `#F1F5F9` | ⬜ |
| text-secondary | `#94A3B8` | |
| accent | `#22D3EE` | 🔵 |
| border | `#334155` | |

### Purple Gradient (타임라인용 기본)

단계별 진행을 시각적으로 표현하기 좋은 퍼플 그라데이션 계열.

| 역할 | 색상 코드 | 미리보기 |
|------|-----------|----------|
| primary | `#8B5CF6` | 🟣 |
| secondary | `#06B6D4` | 🔵 |
| background | `#FAFAFA` | ⬜ |
| surface | `#FFFFFF` | ⬜ |
| text | `#1E293B` | |
| text-secondary | `#64748B` | |
| accent | `#F59E0B` | 🟡 |
| border | `#E2E8F0` | |

## 사용자 정의 팔레트 추가

위 형식에 맞춰 이 파일에 팔레트를 추가하면 된다. AI agent는 슬라이드 생성 시 이 파일의 팔레트 목록을 참조한다.
