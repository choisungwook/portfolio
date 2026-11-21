# 아키텍처 이미지 목록과 생성 프롬프트

이 디렉터리의 다이어그램은 Gemini 이미지 생성 모델로 만들었습니다. 나중에 용어를 바꾸거나 레이아웃을 다시 그려야 할 때 같은 스타일로 재생성할 수 있도록 이미지마다 사용한 프롬프트를 기록합니다.

## 이미지 목록

| 파일명 | 사용하는 문서 | 설명 |
| --- | --- | --- |
| `mysql-vs-postgres-auth.png` | `docs/2-mysql-vs-postgres-rbac.md`, `docs/study-guide.html` | MySQL 계정 중심 모델(`user@host`, `shop.*`)과 PostgreSQL RBAC 계층 모델 비교 |
| `postgres-rbac-hierarchy.png` | `docs/1-overview.md`, `docs/study-guide.html` | PostgreSQL RBAC 권한 계층(Cluster → Database → Schema → Table)과 Object Owner, `ALTER DEFAULT PRIVILEGES` 관계 |
| `flyway-ownership-incident.png` | `docs/3-flyway-ownership-incident.md`, `docs/study-guide.html` | Flyway 계정 직접 소유 안티패턴 장애와 `SET ROLE app_owner` 해결 구조 비교 |
| `password-rotation-blue-green.png` | `docs/4-password-rotation-incident.md`, `docs/study-guide.html` | `NOLOGIN` 그룹 Role 기반 Blue/Green 로그인 계정 무중단 비밀번호 로테이션 흐름 |

## 이미지별 생성 프롬프트

### 1. `mysql-vs-postgres-auth.png`

MySQL의 와일드카드 권한 전파와 PostgreSQL의 계층적 권한 및 `ALTER DEFAULT PRIVILEGES` 필요성을 나란히 비교하는 프롬프트입니다.

```text
Clean flat technical architecture comparison diagram on a crisp white background, 16:9 widescreen layout, divided into two side-by-side panels. Left panel titled "MySQL: Account-Centric (user@host)" with orange and blue accents: shows a user box "app_user@%" directly pointing with a wide wildcard arrow "GRANT SELECT ON shop.*" to a database container "shop" holding two tables "products" and "orders (new)" both marked with green checkmarks. Right panel titled "PostgreSQL: Role-Based Access Control (RBAC)" with indigo and teal accents: shows Login Role "app_user (LOGIN)" inheriting from Group Role "app_read (NOLOGIN)", passing through layered gates "Database (CONNECT)" -> "Schema public (USAGE)" -> "Table (SELECT)", where "products" has a green checkmark and "orders (new)" has a red X badge labeled "Needs DEFAULT PRIVILEGES". Minimalist vector engineering diagram style, clean sans-serif typography, clear arrows, no clutter, high readability.
```

### 2. `postgres-rbac-hierarchy.png`

PostgreSQL의 Role 멤버십, 4단계 인가 계층, 객체 소유권(Object Owner), 미래 객체 기본 권한(`ALTER DEFAULT PRIVILEGES`)을 한 장에 정리하는 프롬프트입니다.

```text
Clean flat technical architecture diagram on a crisp white background, 16:9 widescreen layout, titled "PostgreSQL RBAC Permission Layers & Ownership". Left side shows Role Membership: Login Roles ("app_user", "migrator_user") connected via "GRANT role TO user" arrows into NOLOGIN Group Roles ("app_rw", "app_owner"). Center-right shows four stepped authorization layers from left to right: 1. "Cluster / Role (LOGIN)", 2. "Database (CONNECT)", 3. "Schema (USAGE, CREATE)", 4. "Table & Sequence (SELECT, INSERT, UPDATE)". Above the Table box, a distinct gold crown badge labeled "OBJECT OWNER (ALTER, DROP, GRANT)" pointing from "app_owner". Below the Schema box, a dashed teal arrow labeled "ALTER DEFAULT PRIVILEGES" pointing to a "Future Tables" box. Modern clean vector engineering diagram, soft indigo, teal, and amber accents, crisp sans-serif labels, plenty of whitespace.
```

### 3. `flyway-ownership-incident.png`

Flyway 마이그레이션에서 로그인 계정이 테이블을 직접 소유할 때 생기는 두 가지 장애(`must be owner of table`, `permission denied`)와 `SET ROLE app_owner` 해결 패턴을 비교하는 프롬프트입니다.

```text
Clean flat technical architecture diagram on a crisp white background, 16:9 widescreen layout, split horizontally into top and bottom sections. Top section with soft red border titled "Anti-Pattern: Direct Account Ownership (Incident)": shows "Flyway (migrator_v1)" creating table "products (owner: migrator_v1)". Next to it, "Flyway (migrator_v2)" tries "ALTER TABLE" and hits a red STOP sign labeled "ERROR: must be owner of table", while "app_user" tries "SELECT" on new table "orders" and hits a red X labeled "ERROR: permission denied". Bottom section with soft green border titled "Best Practice: Shared Owner Role (SET ROLE app_owner)": shows "migrator_v1" and "migrator_v2" both connecting through a shared gold box "SET ROLE app_owner (NOLOGIN)" which owns "products" and "orders". A teal arrow "ALTER DEFAULT PRIVILEGES FOR ROLE app_owner" automatically grants "SELECT / INSERT" to "app_rw" -> "app_user" with green checkmarks. Clean vector engineering diagram, crisp sans-serif typography, high clarity.
```

### 4. `password-rotation-blue-green.png`

비밀번호 로테이션을 위해 신규 계정을 만들어 전환하고 기존 계정을 삭제할 때 `NOLOGIN` 그룹 Role이 왜 필수인지 3단계로 나타내는 프롬프트입니다.

```text
Clean flat technical architecture diagram on a crisp white background, 16:9 widescreen layout, titled "Zero-Downtime Password Rotation in PostgreSQL RBAC". Shows a 3-step horizontal flow with a shared central pillar of NOLOGIN Group Roles ("app_owner", "app_rw") owning the Database tables on the right. Left side shows Login Roles: "app_blue (old password)" in muted slate and "app_green (new password)" in bright emerald green, both inheriting privileges from "app_rw". Step 1 badge "1. Create & Grant": "GRANT app_rw TO app_green". Step 2 badge "2. Switch App": Application server arrow switches from "app_blue" to "app_green". Step 3 badge "3. Clean Drop": "DROP ROLE app_blue" succeeds with a green checkmark and caption "0 owned objects -> instant drop". Small red warning callout box at bottom left: "Without Group Role: DROP ROLE fails (objects depend on it)". Modern flat technical vector style, crisp sans-serif text, clear arrows, high contrast.
```
