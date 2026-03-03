package com.example.demo.controller;

import com.example.demo.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/orders")
    public List<Map<String, Object>> getOrders() {
        return orderService.getAllOrders();
    }

    @PostMapping("/orders")
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody Map<String, Object> request) {
        int productId = (int) request.get("productId");
        int quantity = (int) request.getOrDefault("quantity", 1);

        return orderService.createOrder(productId, quantity)
                .map(order -> ResponseEntity.status(HttpStatus.CREATED).body(order))
                .orElse(ResponseEntity.notFound().build());
    }
}
