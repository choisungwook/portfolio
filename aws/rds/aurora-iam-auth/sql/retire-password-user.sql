-- 1단계: 잠금. 되돌리려면 ACCOUNT UNLOCK. 남은 클라이언트는 audit 로그에 FAILED_CONNECT 3118로 드러난다.
ALTER USER 'app_pw'@'%' ACCOUNT LOCK;

-- 2단계: 관찰 기간 동안 audit 로그에 app_pw의 FAILED_CONNECT(3118)가 없으면 삭제한다. 삭제는 되돌릴 수 없다.
-- DROP USER 'app_pw'@'%';
