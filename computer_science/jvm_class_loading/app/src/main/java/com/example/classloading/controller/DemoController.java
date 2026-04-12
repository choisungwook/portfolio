package com.example.classloading.controller;

import com.example.classloading.entity.Product;
import com.example.classloading.service.ProductQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class DemoController {

    private final ProductQueryService productQueryService;

    public DemoController(ProductQueryService productQueryService) {
        this.productQueryService = productQueryService;
    }

    @GetMapping("/products")
    public ResponseEntity<Map<String, Object>> getProductsByCategory(
            @RequestParam(defaultValue = "electronics") String category) {

        long start = System.currentTimeMillis();
        List<Product> products = productQueryService.findByCategory(category);
        long durationMs = System.currentTimeMillis() - start;

        Map<String, Object> response = new HashMap<>();
        response.put("category", category);
        response.put("count", products.size());
        response.put("durationMs", durationMs);

        return ResponseEntity.ok(response);
    }
}
