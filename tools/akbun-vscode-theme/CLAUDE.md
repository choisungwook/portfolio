# Akbun VS Code Theme

## 프로젝트 개요

HCL(Terraform), Ansible, Python, JavaScript 개발자를 위한 VS Code 테마 확장.
밝은 환경에서는 Light, 어두운 환경에서는 Dark 테마를 사용하여 눈 피로를 줄이는 것이 목적.

## 테마 디자인 원칙

### Dark (Akbun Dark)
- **베이스**: Catppuccin Mocha 컬러 팔레트 기반
- **배경**: `#1e1e2e` (Mocha Base) - 따뜻한 다크 톤
- **텍스트**: `#cdd6f4` (Mocha Text)
- **액센트**: Mauve(`#cba6f7`) - 탭 상단 보더, 버튼, 배지
- **특징**: 파스텔 톤 syntax color로 장시간 코딩 시 눈 피로 최소화

### Light (Akbun Light)
- **베이스**: Catppuccin Latte 팔레트 + Claude 모바일앱 디자인
- **배경**: `#faf9f5` (Claude 모바일앱 warm off-white)
- **사이드바**: `#f5f4ed` (Claude 모바일앱 warm grey)
- **텍스트**: `#4c4f69` (Latte Text - dark charcoal)
- **액센트**: `#a84e30` (Claude terracotta, WCAG-darkened) - 탭 상단 보더, 버튼, 배지
- **특징**: 따뜻한 크림톤 배경으로 차가운 흰색 대비 눈 피로 감소
- **중요**: Latte 팔레트를 warm off-white 배경에 맞게 WCAG AA 4.5:1 이상으로 darkened

## 언어별 Syntax 컬러 매핑

Light 테마의 색상은 Catppuccin Latte 기반이지만, `#faf9f5` 배경에서 WCAG AA 4.5:1 대비율을 충족하도록 어둡게 조정.

| 요소             | Dark              | Light             |
|------------------|-------------------|-------------------|
| 키워드           | Mauve `#cba6f7`   | Mauve `#7630c5`   |
| 함수 이름        | Blue `#89b4fa`    | Blue `#1858d9`    |
| 함수 파라미터    | Flamingo `#f2cdcd`| Flamingo `#b04e4e`|
| 문자열           | Green `#a6e3a1`   | Green `#2e7d20`   |
| 숫자             | Peach `#fab387`   | Peach `#b84800`   |
| 클래스/타입      | Yellow `#f9e2af`  | Yellow `#9a650f`  |
| 프로퍼티         | Lavender `#b4befe`| Lavender `#4c5ec8`|
| 주석             | Overlay `#838799` | Subtext0 `#6c6f85`|
| 연산자           | Sky `#89dceb`     | Teal `#0d6d73`    |
| self/this        | Red `#f38ba8`     | Red `#d20f39`     |
| 데코레이터       | Peach `#fab387`   | Peach `#b84800`   |

## 파일 구조

```
tools/akbun-vscode-theme/
├── CLAUDE.md              # 이 파일
├── package.json           # VS Code 확장 매니페스트
├── themes/
│   ├── akbun-dark.json    # 다크 테마 정의
│   └── akbun-light.json   # 라이트 테마 정의
├── test/
│   ├── theme-validator.js   # 테마 JSON 구조/필수 키 검증
│   ├── contrast-checker.js  # WCAG 대비율 검증
│   └── samples/             # 테스트용 샘플 코드 파일
│       ├── sample.py
│       ├── sample.js
│       ├── sample.tf
│       └── sample.yaml
└── images/                # 스크린샷 (선택)
```

## 빌드 & 테스트

```bash
# 테마 JSON 구조 검증
node test/theme-validator.js

# WCAG 대비율 검증
node test/contrast-checker.js

# 전체 테스트
npm test

# VS Code에서 테마 직접 테스트
# 1. 이 폴더를 VS Code로 열기
# 2. F5 (Extension Development Host 실행)
# 3. Ctrl+K Ctrl+T 로 "Akbun Dark" 또는 "Akbun Light" 선택
# 4. test/samples/ 폴더의 샘플 파일을 열어 syntax highlighting 확인
```

## 수정 시 주의사항

- `themes/*.json` 파일 수정 후 반드시 `npm test` 실행하여 검증
- 새로운 색상 추가 시 WCAG AA 기준(일반 텍스트 4.5:1, 큰 텍스트 3:1) 충족 확인
- Dark/Light 테마의 동일 요소는 동일한 Catppuccin 색상 이름(다른 명도)을 사용
- HCL, Ansible, Python, JavaScript 4개 언어의 syntax highlighting 일관성 유지
