package com.example.socketleak;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class ZombieConnectionMetrics {

    private final AtomicInteger zombieCount = new AtomicInteger(0);
    private final Counter leakCounter;

    @Value("${db.url}")
    private String dbUrl;

    @Value("${db.user}")
    private String dbUser;

    @Value("${db.password}")
    private String dbPassword;

    public ZombieConnectionMetrics(MeterRegistry registry) {
        // Gauge: SLEEP 실행 중인 좀비 커넥션 수를 5초마다 갱신
        Gauge.builder("mariadb.zombie.connections", zombieCount, AtomicInteger::get)
                .description("MariaDB에서 SELECT SLEEP 실행 중인 좀비 커넥션 수")
                .register(registry);

        // Counter: /reproduce 호출 누적 (Prometheus에서 mariadb_socket_leak_total로 노출)
        this.leakCounter = Counter.builder("mariadb.socket.leak")
                .description("/reproduce 호출로 발생한 소켓 누수 횟수")
                .register(registry);
    }

    @Scheduled(fixedDelay = 5000)
    public void refreshZombieCount() {
        // db.url (socketTimeout 없음)을 사용해서 모니터링 쿼리가 타임아웃되지 않는다
        try (Connection conn = DriverManager.getConnection(dbUrl, dbUser, dbPassword);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT COUNT(*) FROM information_schema.processlist "
                             + "WHERE command = 'Query' AND info LIKE '%SLEEP%'")) {
            if (rs.next()) {
                zombieCount.set(rs.getInt(1));
            }
        } catch (Exception ignored) {
            // MariaDB 연결 실패 시 이전 값 유지
        }
    }

    public void incrementLeakCounter() {
        leakCounter.increment();
    }
}
