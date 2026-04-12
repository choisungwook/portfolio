package com.example.jvmwarmup.warmup;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;

@Component
@ConditionalOnProperty(name = "warmup.enabled", havingValue = "true")
public class WarmupRunner {

    private static final Logger log = LoggerFactory.getLogger(WarmupRunner.class);

    // 서로 다른 파라미터 조합 — 같은 컨트롤러 메서드지만 분기 경로를 다양하게 타도록 한다
    private static final List<String> WARMUP_QUERIES = List.of(
            "/products/search?category=electronics&minPrice=200000&maxPrice=1800000&page=0&size=25",
            "/products/search?category=electronics&minPrice=800000&maxPrice=1800000&page=1&size=25",
            "/products/search?category=books&minPrice=10000&maxPrice=90000&page=0&size=25",
            "/products/search?category=clothing&minPrice=20000&maxPrice=250000&page=0&size=25",
            "/products/search?category=clothing&minPrice=50000&maxPrice=180000&page=1&size=25",
            "/products/search?category=furniture&minPrice=50000&maxPrice=2000000&page=0&size=25",
            "/products/search?category=food&minPrice=1000&maxPrice=90000&page=0&size=25",
            "/products/search?category=beauty&minPrice=5000&maxPrice=300000&page=0&size=25"
    );

    @Value("${server.port:8080}")
    private int serverPort;

    private volatile boolean completed = false;
    private volatile int successCount = 0;

    @EventListener(ApplicationReadyEvent.class)
    public void warmup() {
        log.info("JVM warmup 시작 — self-HTTP 호출로 Validator/JPA/Jackson 경로를 먼저 예열한다");

        // 자기 자신에게 HTTP 호출을 보내면 DispatcherServlet → Controller → Validation → Service → JPA → Jackson 직렬화까지 전 경로가 실행된다
        RestClient client = RestClient.create("http://localhost:" + serverPort);

        int success = 0;
        long start = System.currentTimeMillis();
        for (String path : WARMUP_QUERIES) {
            try {
                client.get().uri(path).retrieve().toBodilessEntity();
                success++;
                log.info("warmup self-call OK {}/{}: {}", success, WARMUP_QUERIES.size(), path);
            } catch (RestClientException e) {
                log.warn("warmup self-call 실패: path={}, err={}", path, e.getMessage());
            }
        }

        long durationMs = System.currentTimeMillis() - start;
        this.successCount = success;
        // 1개 이상 성공했을 때만 완료로 표시한다. 모두 실패하면 DB/앱이 아직 준비되지 않은 상태일 수 있다.
        this.completed = success > 0;

        if (this.completed) {
            log.info("JVM warmup 완료 — {}/{} 요청 성공, 총 {}ms", success, WARMUP_QUERIES.size(), durationMs);
        } else {
            log.warn("JVM warmup 실패 — 모든 self-call이 실패했다. DB 연결이나 앱 초기화를 확인하라.");
        }
    }

    public boolean isCompleted() {
        return completed;
    }

    public int getSuccessCount() {
        return successCount;
    }

    public int getTotalCount() {
        return WARMUP_QUERIES.size();
    }
}
