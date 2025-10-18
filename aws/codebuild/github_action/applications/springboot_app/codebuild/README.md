# CodeBuild Demo Application

SpringBoot 애플리케이션으로 Nexus에서 호스팅하는 `welcome-lib` 라이브러리를 사용합니다.

## 프로젝트 구조

```
codebuild/
├── pom.xml
├── src/
│   └── main/
│       └── java/com/akbun/codebuild/
│           ├── CodebuildDemoApplication.java
│           └── controller/
│               └── WelcomeController.java
└── README.md
```

## 의존성

- Spring Boot 3.5.6
- Java 17
- **welcome-lib 1.0.0** (Nexus에서 다운로드)

## 로컬 실행

### 1. Nexus URL 설정

`pom.xml`에서 Nexus URL을 실제 도메인으로 변경:

```xml
<repository>
  <id>nexus-releases</id>
  <url>https://nexus.example.com/repository/maven-releases/</url>
</repository>
```

### 2. Maven Settings 설정 (선택사항)

Public repository에서 다운로드하는 경우 인증이 필요없을 수 있지만, private repository인 경우 `~/.m2/settings.xml` 설정:

```xml
<settings>
  <servers>
    <server>
      <id>nexus-releases</id>
      <username>admin</username>
      <password>YOUR_NEXUS_PASSWORD</password>
    </server>
  </servers>
</settings>
```

### 3. 빌드 및 실행

```bash
cd applications/springboot_app/codebuild

mvn clean package

mvn spring-boot:run
```

### 4. 테스트

```bash
# Health check
curl http://localhost:8080/health

# Home
curl http://localhost:8080/

# Welcome message (Nexus 라이브러리 사용)
curl http://localhost:8080/welcome
```

예상 출력:
```
Hello. Welcome
```

## API 엔드포인트

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | 홈 페이지 |
| `/welcome` | GET | welcome-lib를 사용한 환영 메시지 |
| `/health` | GET | Health check |

## CodeBuild에서 실행

CodeBuild에서는 Private IP로 Nexus에 접근합니다.

### buildspec.yml 예시

```yaml
version: 0.2

env:
  secrets-manager:
    NEXUS_PASSWORD: nexus-credentials:password

phases:
  pre_build:
    commands:
      - echo "Creating Maven settings.xml"
      - |
        mkdir -p ~/.m2
        cat > ~/.m2/settings.xml <<EOF
        <settings>
          <servers>
            <server>
              <id>nexus-releases</id>
              <username>admin</username>
              <password>${NEXUS_PASSWORD}</password>
            </server>
          </servers>
        </settings>
        EOF
      - |
        sed -i 's|https://nexus.example.com|http://NEXUS_PRIVATE_IP:8081|g' pom.xml

  build:
    commands:
      - echo "Building SpringBoot application"
      - mvn clean package -DskipTests
      - echo "Build completed successfully"

artifacts:
  files:
    - target/*.jar
  name: codebuild-demo-$(date +%Y%m%d-%H%M%S)
```

**주의:**
- `NEXUS_PRIVATE_IP`를 실제 Nexus EC2 private IP로 변경
- CodeBuild는 private subnet에서 실행되어야 함
- Security Group에서 Nexus EC2:8081 접근 허용 필요

## 트러블슈팅

### 1. welcome-lib를 찾을 수 없는 경우

```bash
[ERROR] Failed to execute goal on project codebuild:
Could not resolve dependencies for project com.akbun:codebuild:jar:0.0.1-SNAPSHOT:
Could not find artifact com.example:welcome-lib:jar:1.0.0
```

**해결:**
- Nexus에 welcome-lib가 업로드되었는지 확인
- `pom.xml`의 repository URL이 올바른지 확인
- settings.xml 인증 정보 확인 (private repository인 경우)

### 2. Nexus 접속 불가

```bash
[ERROR] Failed to read artifact descriptor for com.example:welcome-lib:jar:1.0.0:
Could not transfer artifact
```

**해결:**
- Nexus URL 확인 (https vs http, 포트 번호)
- 네트워크 연결 확인
- Security Group 설정 확인 (CodeBuild 환경인 경우)

## 참고 문서

- [../../nexus.md](../../../nexus.md) - Nexus 설정 및 사용 가이드
- [../../java_modules/welcome-lib/README.md](../../java_modules/welcome-lib/README.md) - welcome-lib 라이브러리
