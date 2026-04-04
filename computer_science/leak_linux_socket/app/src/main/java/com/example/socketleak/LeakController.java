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

    private final ZombieConnectionMetrics metrics;

    @Value("${spring.datasource.url}")
    private String dbUrl;

    @Value("${spring.datasource.username}")
    private String dbUser;

    @Value("${spring.datasource.password}")
    private String dbPassword;

    public LeakController(ZombieConnectionMetrics metrics) {
        this.metrics = metrics;
    }

    private Connection getConnection() throws SQLException {
        return DriverManager.getConnection(dbUrl, dbUser, dbPassword);
    }

    @GetMapping("/reproduce")
    public Map<String, Object> reproduceSocketLeak(
            @RequestParam(defaultValue = "30") int sleepSeconds) {

        Map<String, Object> result = new LinkedHashMap<>();

        metrics.incrementLeakCounter();

        result.put("connectionPool", "None (Raw JDBC)");
        result.put("query", "SELECT SLEEP(" + sleepSeconds + ")");
        result.put("socketTimeoutMs", 3000);

        long startTime = System.currentTimeMillis();

        // try-with-resources에서 제외하여 예외 발생 시 conn.close()가 호출되지 않도록 합니다.
        Connection conn = null;
        Statement stmt = null;
        try {
            conn = getConnection();
            stmt = conn.createStatement();

            stmt.executeQuery("SELECT SLEEP(" + sleepSeconds + ")");
            result.put("status", "COMPLETED");

            stmt.close();
            conn.close();
        } catch (SQLException e) {
            long elapsed = System.currentTimeMillis() - startTime;
            result.put("status", "SOCKET_LEAKED");
            result.put("elapsedMs", elapsed);
            result.put("errorClass", e.getClass().getSimpleName());
            result.put("errorMessage", e.getMessage());
            result.put("explanation",
                    "타임아웃이 발생했지만 소켓이 닫히지 않았습니다. "
                    + "/check 으로 좀비 커넥션을 확인하세요.");
            // 버그 핵심: 타임아웃 발생 시 개발자가 catch 블록이나 finally에서 명시적으로
            // conn.close()를 호출하지 않으면 소켓이 영원히 ESTABLISHED 상태로 누수됩니다.
        }

        return result;
    }

    @GetMapping("/check")
    public Map<String, Object> checkProcessList() {
        Map<String, Object> result = new LinkedHashMap<>();
        try (Connection conn = getConnection();
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
