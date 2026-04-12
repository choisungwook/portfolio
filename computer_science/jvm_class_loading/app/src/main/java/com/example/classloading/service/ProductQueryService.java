package com.example.classloading.service;

import com.example.classloading.entity.Product;
import com.example.classloading.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

// 이 클래스는 첫 HTTP 요청이 들어올 때 JPA 쿼리를 실행하는 시점에 lazy 로딩된다.
// -Xlog:class+load=info 로그에서 com.example.classloading.service.ProductQueryService 항목을 확인할 수 있다.
@Service
public class ProductQueryService {

    private static final Logger log = LoggerFactory.getLogger(ProductQueryService.class);

    private final ProductRepository productRepository;

    public ProductQueryService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    public List<Product> findByCategory(String category) {
        long start = System.currentTimeMillis();

        List<Product> products = productRepository.findByCategory(category);

        long durationMs = System.currentTimeMillis() - start;
        log.info("category={} 조회 완료, count={}, durationMs={}", category, products.size(), durationMs);

        return products;
    }
}
