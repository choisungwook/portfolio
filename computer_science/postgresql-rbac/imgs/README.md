# 아키텍처 이미지 목록과 생성 프롬프트

현재 문서(`docs/*.md`, `docs/study-guide.html`)는 `/akbun-draw-diagram-haru` 스타일로 생성한 `haru-*.png` 이미지를 사용합니다. 기존에 먼저 만들었던 이미지와 프롬프트는 삭제하지 않고 `old-` 접두사를 붙여 함께 보존합니다.

## 현재 사용 중인 이미지 (`haru-*`)

| 파일명 | 사용하는 문서 | 팔레트 / 배치 | 설명 |
| --- | --- | --- | --- |
| `haru-mysql-vs-postgres-auth.png` | `docs/2-mysql-vs-postgres-rbac.md`, `docs/study-guide.html` | `ink-blue` / `split` | MySQL `shop.*` 와일드카드 권한과 PostgreSQL RBAC 계층 비교 |
| `haru-postgres-rbac-hierarchy.png` | `docs/1-overview.md`, `docs/study-guide.html` | `ink-blue` / `columns` | PostgreSQL RBAC 4단계 권한 계층, Object Owner, `ALTER DEFAULT PRIVILEGES` |
| `haru-flyway-ownership-incident.png` | `docs/3-flyway-ownership-incident.md`, `docs/study-guide.html` | `ink-blue` / `split` | Flyway 계정 직접 소유 장애 vs `SET ROLE app_owner` 해결 구조 |
| `haru-password-rotation-blue-green.png` | `docs/4-password-rotation-incident.md`, `docs/study-guide.html` | `ink-green` / `columns` | `NOLOGIN` 그룹 Role 기반 Blue/Green 무중단 비밀번호 로테이션 |

## 기존 보존 이미지 (`old-*`)

| 파일명 | 설명 |
| --- | --- |
| `old-mysql-vs-postgres-auth.png` | 초기 벡터 스타일 MySQL vs PostgreSQL 권한 비교 |
| `old-postgres-rbac-hierarchy.png` | 초기 벡터 스타일 PostgreSQL RBAC 권한 계층 |
| `old-flyway-ownership-incident.png` | 초기 벡터 스타일 Flyway 소유권 장애와 해결 |
| `old-password-rotation-blue-green.png` | 초기 벡터 스타일 Blue/Green 비밀번호 로테이션 |

## haru 이미지 생성 프롬프트

### 1. `haru-mysql-vs-postgres-auth.png`

`akbun-draw-diagram-haru` 스크립트(`haru_prompt.py build`, 100점)로 조립한 프롬프트입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: Two side-by-side halves compare two situations (before and after, or A and B), each half with its own shapes; a thin vertical gap separates them.

SUBJECT: Comparing MySQL wildcard database grants that cover new tables against PostgreSQL RBAC where new tables need default privileges.

SHAPES (7): 1. a circle in the left half named "app_user" over "(MySQL)" on two lines. 2. an upright cylinder in the left half named "products". 3. an upright cylinder in the left half named "orders" over "(new)" on two lines. 4. a circle in the right half named "app_user" over "(LOGIN)" on two lines. 5. a rectangle in the right half named "app_read" over "(NOLOGIN)" on two lines. 6. an upright cylinder in the right half named "products". 7. an upright cylinder in the right half named "orders" over "(new)" on two lines.

GROUPS (2): A. a large rectangle with a thin dashed #1E1E1E outline, empty and white inside, with its name "MySQL shop.*" written small in #1E1E1E at the top-left corner just inside the outline. It encloses shape 2 and shape 3 fully inside it with clear padding. B. a large rectangle with a thin dashed #1E1E1E outline, empty and white inside, with its name "PG public schema" written small in #1E1E1E at the top-left corner just inside the outline. It encloses shape 6 and shape 7 fully inside it with clear padding. Group outlines only enclose their members: a group inside another group sits wholly within it, and no group outline crosses a shape or another group.

ARROWS (4): 1. from shape 1 ("app_user (MySQL)") to the outline of group A ("MySQL shop.*"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "GRANT shop.*" in small #4A90D0 lettering beside the line. 2. from shape 4 ("app_user (LOGIN)") to shape 5 ("app_read (NOLOGIN)"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "member" in small #4A90D0 lettering beside the line. 3. from shape 5 ("app_read (NOLOGIN)") to shape 6 ("products"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "SELECT OK" in small #4A90D0 lettering beside the line. 4. from shape 5 ("app_read (NOLOGIN)") to shape 7 ("orders (new)"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "denied" in small #4A90D0 lettering beside the line.

NOTES: Just below shape 7 ("orders (new)"), a small note in #4A90D0 lettering reads "ALTER DEFAULT PRIVILEGES 필요".

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Each arrow ends exactly on the target outline and never crosses through a shape. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading, no legend, no watermark.
```

### 2. `haru-postgres-rbac-hierarchy.png`

`akbun-draw-diagram-haru` 스크립트(`haru_prompt.py build`, 100점)로 조립한 프롬프트입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes sit in vertical columns placed from left to right, one column per stage, with arrows running between columns.

SUBJECT: PostgreSQL RBAC authorization layers from login roles through group roles, database and schema gates to tables, object owner, and future tables.

SHAPES (8): 1. a circle in column 1 from the left named "migrator" over "(LOGIN)" on two lines. 2. a circle in column 1 from the left named "app_user" over "(LOGIN)" on two lines. 3. a rectangle in column 2 from the left named "app_owner" over "(NOLOGIN)" on two lines. 4. a rectangle in column 2 from the left named "app_rw" over "(NOLOGIN)" on two lines. 5. a rectangle in column 3 from the left named "shop DB" over "(CONNECT)" on two lines. 6. a rectangle in column 3 from the left named "public" over "(USAGE)" on two lines. 7. an upright cylinder in column 4 from the left named "Tables &" over "Sequences" on two lines. 8. an upright cylinder in column 4 from the left named "Future" over "Tables" on two lines.

GROUPS (2): A. a large rectangle with a thin dashed #1E1E1E outline, empty and white inside, with its name "Role Membership" written small in #1E1E1E at the top-left corner just inside the outline. It encloses shape 1, shape 2, shape 3 and shape 4 fully inside it with clear padding. B. a large rectangle with a thin dashed #1E1E1E outline, empty and white inside, with its name "Permission Gates" written small in #1E1E1E at the top-left corner just inside the outline. It encloses shape 5 and shape 6 fully inside it with clear padding. Group outlines only enclose their members: a group inside another group sits wholly within it, and no group outline crosses a shape or another group.

ARROWS (7): 1. from shape 1 ("migrator (LOGIN)") to shape 3 ("app_owner (NOLOGIN)"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "member" in small #4A90D0 lettering beside the line. 2. from shape 2 ("app_user (LOGIN)") to shape 4 ("app_rw (NOLOGIN)"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "member" in small #4A90D0 lettering beside the line. 3. from shape 4 ("app_rw (NOLOGIN)") to shape 5 ("shop DB (CONNECT)"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "1" in #4A90D0 near the middle of the line. 4. from shape 5 ("shop DB (CONNECT)") to shape 6 ("public (USAGE)"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "2" in #4A90D0 near the middle of the line. 5. from shape 6 ("public (USAGE)") to shape 7 ("Tables & Sequences"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "3" in #4A90D0 near the middle of the line, labeled "DML OK" in small #4A90D0 lettering beside the line. 6. from shape 3 ("app_owner (NOLOGIN)") to shape 7 ("Tables & Sequences"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "OWNER DDL" in small #4A90D0 lettering beside the line. 7. from shape 3 ("app_owner (NOLOGIN)") to shape 8 ("Future Tables"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "DEFAULT PRIV" in small #4A90D0 lettering beside the line.

NOTES: Just below shape 8 ("Future Tables"), a small note in #4A90D0 lettering reads "생성자 Role 기준으로 미리 설정".

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Each arrow ends exactly on the target outline and never crosses through a shape. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading, no legend, no watermark.
```

### 3. `haru-flyway-ownership-incident.png`

`akbun-draw-diagram-haru` 스크립트(`haru_prompt.py build`, 100점)로 조립한 프롬프트입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: Two side-by-side halves compare two situations (before and after, or A and B), each half with its own shapes; a thin vertical gap separates them.

SUBJECT: Flyway direct account ownership causing must be owner errors versus using SET ROLE app_owner so every migrator shares ownership.

SHAPES (10): 1. a circle in the left half named "migrator_v1". 2. a circle in the left half named "migrator_v2". 3. an upright cylinder in the left half named "products" over "(owner v1)" on two lines. 4. a circle in the left half named "app_user". 5. an upright cylinder in the left half named "orders" over "(new)" on two lines. 6. a circle in the right half named "migrator_v1". 7. a circle in the right half named "migrator_v2". 8. a rectangle in the right half named "app_owner" over "(NOLOGIN)" on two lines. 9. an upright cylinder in the right half named "products &" over "orders" on two lines. 10. a circle in the right half named "app_user" over "(via app_rw)" on two lines.

ARROWS (7): 1. from shape 1 ("migrator_v1") to shape 3 ("products (owner v1)"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "V1 CREATE" in small #4A90D0 lettering beside the line. 2. from shape 2 ("migrator_v2") to shape 3 ("products (owner v1)"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "not owner" in small #4A90D0 lettering beside the line. 3. from shape 4 ("app_user") to shape 5 ("orders (new)"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "denied" in small #4A90D0 lettering beside the line. 4. from shape 6 ("migrator_v1") to shape 8 ("app_owner (NOLOGIN)"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "SET ROLE" in small #4A90D0 lettering beside the line. 5. from shape 7 ("migrator_v2") to shape 8 ("app_owner (NOLOGIN)"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head. 6. from shape 8 ("app_owner (NOLOGIN)") to shape 9 ("products & orders"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "owns all" in small #4A90D0 lettering beside the line. 7. from shape 10 ("app_user (via app_rw)") to shape 9 ("products & orders"): a gently curved solid #4A90D0 line with a hollow #4A90D0 triangle head.

NOTES: Just below shape 3 ("products (owner v1)"), a small note in #4A90D0 lettering reads "must be owner of table". Just below shape 8 ("app_owner (NOLOGIN)"), a small note in #4A90D0 lettering reads "initSql로 소유권 통일".

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Each arrow ends exactly on the target outline and never crosses through a shape. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading, no legend, no watermark.
```

### 4. `haru-password-rotation-blue-green.png`

`akbun-draw-diagram-haru` 스크립트(`haru_prompt.py build`, 100점)로 조립한 프롬프트입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes sit in vertical columns placed from left to right, one column per stage, with arrows running between columns.

SUBJECT: Zero-downtime PostgreSQL password rotation using blue and green login roles that inherit privileges from shared NOLOGIN group roles.

SHAPES (6): 1. a rectangle in column 1 from the left named "App Server". 2. a circle in column 2 from the left named "app_blue" over "(old pass)" on two lines. 3. a circle in column 2 from the left named "app_green" over "(new pass)" on two lines. 4. a rectangle in column 3 from the left named "app_rw" over "(NOLOGIN)" on two lines. 5. a rectangle in column 3 from the left named "app_owner" over "(NOLOGIN)" on two lines. 6. an upright cylinder in column 4 from the left named "shop DB" over "Tables" on two lines.

GROUPS (2): A. a large rectangle with a thin dashed #1E1E1E outline, empty and white inside, with its name "Login Roles" written small in #1E1E1E at the top-left corner just inside the outline. It encloses shape 2 and shape 3 fully inside it with clear padding. B. a large rectangle with a thin dashed #1E1E1E outline, empty and white inside, with its name "NOLOGIN Group Roles" written small in #1E1E1E at the top-left corner just inside the outline. It encloses shape 4 and shape 5 fully inside it with clear padding. Group outlines only enclose their members: a group inside another group sits wholly within it, and no group outline crosses a shape or another group.

ARROWS (6): 1. from shape 3 ("app_green (new pass)") to shape 4 ("app_rw (NOLOGIN)"): a straight dashed #2E9E6B line with a hollow #2E9E6B triangle head, with a small hollow #2E9E6B circle holding the number "1" in #2E9E6B near the middle of the line, labeled "GRANT app_rw" in small #2E9E6B lettering beside the line. 2. from shape 1 ("App Server") to shape 3 ("app_green (new pass)"): a gently curved solid #2E9E6B line with a hollow #2E9E6B triangle head, with a small hollow #2E9E6B circle holding the number "2" in #2E9E6B near the middle of the line, labeled "switch app" in small #2E9E6B lettering beside the line. 3. from shape 1 ("App Server") to shape 2 ("app_blue (old pass)"): a straight dashed #2E9E6B line with a hollow #2E9E6B triangle head, labeled "old traffic" in small #2E9E6B lettering beside the line. 4. from shape 2 ("app_blue (old pass)") to shape 4 ("app_rw (NOLOGIN)"): a straight dashed #2E9E6B line with a hollow #2E9E6B triangle head, with a small hollow #2E9E6B circle holding the number "3" in #2E9E6B near the middle of the line, labeled "DROP OK" in small #2E9E6B lettering beside the line. 5. from shape 4 ("app_rw (NOLOGIN)") to shape 6 ("shop DB Tables"): a gently curved solid #2E9E6B line with a hollow #2E9E6B triangle head, labeled "DML" in small #2E9E6B lettering beside the line. 6. from shape 5 ("app_owner (NOLOGIN)") to shape 6 ("shop DB Tables"): a gently curved solid #2E9E6B line with a hollow #2E9E6B triangle head.

NOTES: Just below shape 2 ("app_blue (old pass)"), a small note in #2E9E6B lettering reads "소유 객체 0개라 즉시 DROP 가능".

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #2E9E6B. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #2E9E6B. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #2E9E6B; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Each arrow ends exactly on the target outline and never crosses through a shape. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading, no legend, no watermark.
```

## 기존 이미지 생성 프롬프트 (`old-*`)

### 1. `old-mysql-vs-postgres-auth.png`

초기 벡터 스타일 비교 다이어그램 생성에 사용한 프롬프트입니다.

```text
Clean flat technical architecture comparison diagram on a crisp white background, 16:9 widescreen layout, divided into two side-by-side panels. Left panel titled "MySQL: Account-Centric (user@host)" with orange and blue accents: shows a user box "app_user@%" directly pointing with a wide wildcard arrow "GRANT SELECT ON shop.*" to a database container "shop" holding two tables "products" and "orders (new)" both marked with green checkmarks. Right panel titled "PostgreSQL: Role-Based Access Control (RBAC)" with indigo and teal accents: shows Login Role "app_user (LOGIN)" inheriting from Group Role "app_read (NOLOGIN)", passing through layered gates "Database (CONNECT)" -> "Schema public (USAGE)" -> "Table (SELECT)", where "products" has a green checkmark and "orders (new)" has a red X badge labeled "Needs DEFAULT PRIVILEGES". Minimalist vector engineering diagram style, clean sans-serif typography, clear arrows, no clutter, high readability.
```

### 2. `old-postgres-rbac-hierarchy.png`

초기 벡터 스타일 RBAC 계층 다이어그램 생성에 사용한 프롬프트입니다.

```text
Clean flat technical architecture diagram on a crisp white background, 16:9 widescreen layout, titled "PostgreSQL RBAC Permission Layers & Ownership". Left side shows Role Membership: Login Roles ("app_user", "migrator_user") connected via "GRANT role TO user" arrows into NOLOGIN Group Roles ("app_rw", "app_owner"). Center-right shows four stepped authorization layers from left to right: 1. "Cluster / Role (LOGIN)", 2. "Database (CONNECT)", 3. "Schema (USAGE, CREATE)", 4. "Table & Sequence (SELECT, INSERT, UPDATE)". Above the Table box, a distinct gold crown badge labeled "OBJECT OWNER (ALTER, DROP, GRANT)" pointing from "app_owner". Below the Schema box, a dashed teal arrow labeled "ALTER DEFAULT PRIVILEGES" pointing to a "Future Tables" box. Modern clean vector engineering diagram, soft indigo, teal, and amber accents, crisp sans-serif labels, plenty of whitespace.
```

### 3. `old-flyway-ownership-incident.png`

초기 벡터 스타일 Flyway 소유권 비교 다이어그램 생성에 사용한 프롬프트입니다.

```text
Clean flat technical architecture diagram on a crisp white background, 16:9 widescreen layout, split horizontally into top and bottom sections. Top section with soft red border titled "Anti-Pattern: Direct Account Ownership (Incident)": shows "Flyway (migrator_v1)" creating table "products (owner: migrator_v1)". Next to it, "Flyway (migrator_v2)" tries "ALTER TABLE" and hits a red STOP sign labeled "ERROR: must be owner of table", while "app_user" tries "SELECT" on new table "orders" and hits a red X labeled "ERROR: permission denied". Bottom section with soft green border titled "Best Practice: Shared Owner Role (SET ROLE app_owner)": shows "migrator_v1" and "migrator_v2" both connecting through a shared gold box "SET ROLE app_owner (NOLOGIN)" which owns "products" and "orders". A teal arrow "ALTER DEFAULT PRIVILEGES FOR ROLE app_owner" automatically grants "SELECT / INSERT" to "app_rw" -> "app_user" with green checkmarks. Clean vector engineering diagram, crisp sans-serif typography, high clarity.
```

### 4. `old-password-rotation-blue-green.png`

초기 벡터 스타일 Blue/Green 비밀번호 로테이션 다이어그램 생성에 사용한 프롬프트입니다.

```text
Clean flat technical architecture diagram on a crisp white background, 16:9 widescreen layout, titled "Zero-Downtime Password Rotation in PostgreSQL RBAC". Shows a 3-step horizontal flow with a shared central pillar of NOLOGIN Group Roles ("app_owner", "app_rw") owning the Database tables on the right. Left side shows Login Roles: "app_blue (old password)" in muted slate and "app_green (new password)" in bright emerald green, both inheriting privileges from "app_rw". Step 1 badge "1. Create & Grant": "GRANT app_rw TO app_green". Step 2 badge "2. Switch App": Application server arrow switches from "app_blue" to "app_green". Step 3 badge "3. Clean Drop": "DROP ROLE app_blue" succeeds with a green checkmark and caption "0 owned objects -> instant drop". Small red warning callout box at bottom left: "Without Group Role: DROP ROLE fails (objects depend on it)". Modern flat technical vector style, crisp sans-serif text, clear arrows, high contrast.
```
