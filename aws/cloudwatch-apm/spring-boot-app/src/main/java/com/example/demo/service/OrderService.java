package com.example.demo.service;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class OrderService {

    private final ProductService productService;
    private final List<Map<String, Object>> orders = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger idCounter = new AtomicInteger(0);

    public OrderService(ProductService productService) {
        this.productService = productService;
    }

    public List<Map<String, Object>> getAllOrders() {
        return List.copyOf(orders);
    }

    public Optional<Map<String, Object>> createOrder(int productId, int quantity) {
        return productService.getProductById(productId).map(product -> {
            simulateLatency();
            Map<String, Object> order = new LinkedHashMap<>();
            order.put("id", idCounter.incrementAndGet());
            order.put("productId", productId);
            order.put("productName", product.get("name"));
            order.put("quantity", quantity);
            order.put("totalPrice", (int) product.get("price") * quantity);
            orders.add(order);
            return order;
        });
    }

    private void simulateLatency() {
        try {
            Thread.sleep((long) (Math.random() * 80 + 20));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
