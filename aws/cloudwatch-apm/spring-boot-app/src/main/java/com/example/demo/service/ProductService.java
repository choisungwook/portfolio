package com.example.demo.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ProductService {

    private static final List<Map<String, Object>> PRODUCTS = List.of(
            Map.of("id", 1, "name", "Keyboard", "price", 89000),
            Map.of("id", 2, "name", "Mouse", "price", 45000),
            Map.of("id", 3, "name", "Monitor", "price", 350000)
    );

    public List<Map<String, Object>> getAllProducts() {
        simulateLatency();
        return PRODUCTS;
    }

    public Optional<Map<String, Object>> getProductById(int id) {
        simulateLatency();
        return PRODUCTS.stream()
                .filter(p -> (int) p.get("id") == id)
                .findFirst();
    }

    private void simulateLatency() {
        try {
            Thread.sleep((long) (Math.random() * 40 + 10));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
