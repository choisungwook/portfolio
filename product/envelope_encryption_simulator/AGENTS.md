# Envelope Encryption Simulator

KMS Envelope Encryption Simulator 프로젝트

## 개요

브라우저에서 KMS 봉투 암호화(Envelope Encryption) 흐름을 직접 체험하는 학습 도구. 백엔드 없이 Web Crypto API로 동작하는 Astro 정적 사이트.

## 디렉토리

```bash
./
├── package.json              # Astro
├── astro.config.mjs          # output: 'static' (기본값)
├── tsconfig.json             # Astro strict
├── .gitignore                # node_modules, dist, .astro
└── src/
    ├── pages/
    │   └── index.astro       # 메인 페이지 (CSS import + script is:inline)
    └── styles/
        └── global.css        # Akbun CSS 스타일
```

## 빌드

```bash
cd product/envelope_encryption_simulator

# 의존성 설치
npm install

# 개발 서버 (핫 리로드)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 아키텍처

```
Browser → Cloudflare Pages (CDN 내장, HTTPS 자동)
            ↑
      Git push → Cloudflare 자동 빌드/배포
```

- **호스팅**: Cloudflare Pages (무료)
- **빌드**: Astro 정적 사이트 생성
- **CDN/SSL**: Cloudflare Pages 기본 제공
- **배포**: Git push → Cloudflare 자동 빌드/배포
- **Terraform 불필요**, GitHub Actions 불필요

## 배포 방법 (프로덕션)

- [배포 방법](./deploy.md)

## 제약사항

- 프론트엔드: Astro 정적 사이트, inline JS (`<script is:inline>`), 외부 JS 프레임워크 없음
- CSS 스타일 (Sora + Outfit + Fira Code, 노란 하이라이트 최소화)
- 암호화: Web Crypto API (AES-256-GCM), 인메모리 키 저장
