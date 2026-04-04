package com.example.socketleak;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class LeakController {

    @Value("${db.url}")
    private String dbUrl;

    @Value("${db.user}")
    private String dbUser;

    @Value("${db.password}")
    private String dbPassword;

    private final ZombieConnectionMetrics metrics;

    public LeakController(ZombieConnectionMetrics metrics) {
        this.metrics = metrics;
    }

    /**
     * 소켓 누수를 재현한다.
     *
     * socketTimeout보다 오래 걸리는 쿼리(SELECT SLEEP)를 실행하면,
     * SocketTimeoutException이 발생한다.
     *
     * mariadb-java-client 2.7.2: 소켓이 닫히지 않아 서버에 좀비 커넥션이 남는다.
     * mariadb-java-client 2.7.4: destroySocket()이 호출되어 소켓이 정상 해제된다.
     */
    @GetMapping("/reproduce")
    public Map<String, Object> reproduceSocketLeak(
            @RequestParam(defaultValue = "30") int sleepSeconds,
            @RequestParam(defaultValue = "3000") int socketTimeoutMs) {

        String leakUrl = dbUrl + "?socketTimeout=" + socketTimeoutMs;
        Map<String, Object> result = new LinkedHashMap<>();

        metrics.incrementLeakCounter();

        result.put("jdbcUrl", leakUrl);
        result.put("query", "SELECT SLEEP(" + sleepSeconds + ")");
        result.put("socketTimeoutMs", socketTimeoutMs);

        long startTime = System.currentTimeMillis();

        // try-with-resources로 올바르게 자원 정리를 시도한다.
        // 하지만 mariadb-java-client 2.7.2 버그로 인해
        // conn.close()가 호출되어도 TCP 소켓이 닫히지 않는다.
        try (Connection conn = DriverManager.getConnection(leakUrl, dbUser, dbPassword);
             Statement stmt = conn.createStatement()) {

            stmt.executeQuery("SELECT SLEEP(" + sleepSeconds + ")");
            result.put("status", "COMPLETED");

        } catch (SQLException e) {
            long elapsed = System.currentTimeMillis() - startTime;
            result.put("status", "SOCKET_LEAKED");
            result.put("elapsedMs", elapsed);
            result.put("errorClass", e.getClass().getSimpleName());
            result.put("errorMessage", e.getMessage());
            result.put("explanation",
                    "타임아웃이 발생했지만 소켓이 닫히지 않았습니다. "
                    + "/check 으로 좀비 커넥션을 확인하세요.");
        }

        return result;
    }

    /**
     * MariaDB SHOW PROCESSLIST로 좀비 커넥션을 확인한다.
     * SELECT SLEEP 쿼리가 실행 중인 커넥션이 좀비다.
     */
    @GetMapping("/check")
    public Map<String, Object> checkProcessList() {
        Map<String, Object> result = new LinkedHashMap<>();

        // dbUrl (socketTimeout 없음)으로 연결 — 이 쿼리 자체가 타임아웃되지 않아야 한다
        try (Connection conn = DriverManager.getConnection(dbUrl, dbUser, dbPassword);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SHOW PROCESSLIST")) {

            List<Map<String, String>> processes = new ArrayList<>();
            ResultSetMetaData meta = rs.getMetaData();

            while (rs.next()) {
                Map<String, String> process = new LinkedHashMap<>();
                for (int i = 1; i <= meta.getColumnCount(); i++) {
                    process.put(meta.getColumnName(i), rs.getString(i));
                }
                processes.add(process);
            }

            long zombieCount = processes.stream()
                    .filter(p -> {
                        String info = p.get("Info");
                        return info != null && info.contains("SLEEP");
                    })
                    .count();

            result.put("totalConnections", processes.size());
            result.put("zombieConnections", zombieCount);
            result.put("processes", processes);

        } catch (SQLException e) {
            result.put("error", e.getMessage());
        }

        return result;
    }

    /**
     * 드라이버 버전 정보를 반환한다.
     */
    @GetMapping("/info")
    public Map<String, Object> driverInfo() {
        Map<String, Object> result = new LinkedHashMap<>();

        try {
            java.sql.Driver driver = DriverManager.getDriver("jdbc:mariadb://localhost");
            result.put("driverName", driver.getClass().getName());
            result.put("majorVersion", driver.getMajorVersion());
            result.put("minorVersion", driver.getMinorVersion());
        } catch (SQLException e) {
            result.put("error", e.getMessage());
        }

        return result;
    }
}
