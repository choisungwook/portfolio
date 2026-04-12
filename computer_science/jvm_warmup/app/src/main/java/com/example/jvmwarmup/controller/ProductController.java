package com.example.jvmwarmup.controller;

import com.example.jvmwarmup.dto.SearchResponseDto;
import com.example.jvmwarmup.entity.Product;
import com.example.jvmwarmup.service.ProductService;
import com.example.jvmwarmup.warmup.WarmupRunner;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@Validated
public class ProductController {

    private final ProductService productService;

    // WarmupRunner는 warmup.enabled=false일 때 빈이 생성되지 않으므로 Optional로 주입한다
    private final Optional<WarmupRunner> warmupRunner;

    @Value("${warmup.enabled:false}")
    private boolean warmupEnabled;

    public ProductController(ProductService productService, Optional<WarmupRunner> warmupRunner) {
        this.productService = productService;
        this.warmupRunner = warmupRunner;
    }

    @GetMapping("/products")
    public ResponseEntity<Map<String, Object>> getProductsByCategory(
            @RequestParam(defaultValue = "electronics") @NotBlank String category) {

        long start = System.currentTimeMillis();
        List<Product> products = productService.findByCategory(category);
        long durationMs = System.currentTimeMillis() - start;

        Map<String, Object> response = new HashMap<>();
        response.put("category", category);
        response.put("count", products.size());
        response.put("durationMs", durationMs);
        response.put("warmupEnabled", warmupEnabled);

        return ResponseEntity.ok(response);
    }

    // 쿼리 5개 + DTO 매핑 + Jackson 직렬화가 합쳐진 무거운 엔드포인트
    // Bean Validation, Hibernate 쿼리 플랜, DTO 매핑 경로가 cold start에서 함께 준비된다.
    @GetMapping("/products/search")
    public ResponseEntity<SearchResponseDto> searchProducts(
            @RequestParam(defaultValue = "electronics") @NotBlank String category,
            @RequestParam(defaultValue = "0") @Min(0) int minPrice,
            @RequestParam(defaultValue = "2000000") @Min(0) int maxPrice,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "25") @Min(1) @Max(50) int size) {

        SearchResponseDto result = productService.searchProducts(category, minPrice, maxPrice, page, size);
        result.setWarmupEnabled(warmupEnabled);

        return ResponseEntity.ok(result);
    }

    @GetMapping("/warmup/status")
    public ResponseEntity<Map<String, Object>> getWarmupStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("warmupEnabled", warmupEnabled);
        status.put("completed", warmupRunner.map(WarmupRunner::isCompleted).orElse(false));
        status.put("successCount", warmupRunner.map(WarmupRunner::getSuccessCount).orElse(0));
        status.put("totalCount", warmupRunner.map(WarmupRunner::getTotalCount).orElse(0));

        return ResponseEntity.ok(status);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        Map<String, String> response = new HashMap<>();
        response.put("status", "UP");
        return ResponseEntity.ok(response);
    }
}
