package com.example.jvmwarmup.repository;

import com.example.jvmwarmup.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByCategory(String category);

    Page<Product> findByCategoryAndPriceBetween(String category, int minPrice, int maxPrice, Pageable pageable);

    long countByCategory(String category);

    List<Product> findTop5ByCategoryOrderByPriceDesc(String category);

    @Query("""
            SELECT MIN(p.price), MAX(p.price), AVG(p.price)
            FROM Product p
            WHERE p.category = :category
              AND p.price BETWEEN :minPrice AND :maxPrice
            """)
    List<Object[]> findPriceSummary(@Param("category") String category,
                                    @Param("minPrice") int minPrice,
                                    @Param("maxPrice") int maxPrice);

    // 카테고리별 평균 가격 집계 — 첫 호출 시 JPQL 파싱과 집계 쿼리 플랜 생성이 함께 일어난다
    @Query("""
            SELECT p.category, AVG(p.price), COUNT(p)
            FROM Product p
            GROUP BY p.category
            ORDER BY AVG(p.price) DESC
            """)
    List<Object[]> findCategoryStats(Pageable pageable);
}
