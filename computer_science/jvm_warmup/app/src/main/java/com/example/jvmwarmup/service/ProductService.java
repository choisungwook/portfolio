package com.example.jvmwarmup.service;

import com.example.jvmwarmup.dto.SearchResponseDto;
import com.example.jvmwarmup.entity.Product;
import com.example.jvmwarmup.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductService.class);
    private static final int MAX_PAGE_SIZE = 50;

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<Product> findByCategory(String category) {
        long start = System.currentTimeMillis();

        List<Product> products = productRepository.findByCategory(category);

        long durationMs = System.currentTimeMillis() - start;
        log.info("category={} 조회 완료, count={}, durationMs={}", category, products.size(), durationMs);

        return products;
    }

    // /products/search 전용 — 쿼리 5개를 순서대로 실행하고 DTO로 조립한다
    // (검색 페이지, 카테고리 count, 고가 상품 preview, 가격 요약, 카테고리 집계)
    // cold start 시점에는 JPA 쿼리 플랜, Validator metadata, Jackson 직렬화 메타데이터가 함께 초기화된다.
    // 이 비용이 트랜잭션 안에서 발생하면 Hikari usage time이 먼저 늘고, 버스트 부하에서는 acquire time이 뒤따라 오른다.
    @Transactional(readOnly = true)
    public SearchResponseDto searchProducts(String category, int minPrice, int maxPrice, int page, int size) {
        long start = System.currentTimeMillis();
        int normalizedSize = Math.min(size, MAX_PAGE_SIZE);
        PageRequest pageRequest = PageRequest.of(page, normalizedSize, Sort.by(Sort.Direction.DESC, "price"));

        // 쿼리 1: 메인 검색 페이지 + count query
        Page<Product> searchPage = productRepository.findByCategoryAndPriceBetween(category, minPrice, maxPrice, pageRequest);

        // 쿼리 2: 카테고리 전체 count
        long totalInCategory = productRepository.countByCategory(category);

        // 쿼리 3: 고가 상품 preview
        List<Product> premiumPreview = productRepository.findTop5ByCategoryOrderByPriceDesc(category);

        // 쿼리 4: 검색 범위 요약
        List<Object[]> rawPriceSummaryRows = productRepository.findPriceSummary(category, minPrice, maxPrice);

        // 쿼리 5: 전체 카테고리 집계
        List<Object[]> rawStats = productRepository.findCategoryStats(PageRequest.of(0, 5));

        // DTO mapping — 첫 요청에서 Jackson introspection과 DTO 생성 경로가 함께 예열된다
        List<SearchResponseDto.ProductDto> products = searchPage.getContent().stream()
                .map(p -> new SearchResponseDto.ProductDto(p.getId(), p.getName(), p.getCategory(), p.getPrice()))
                .collect(Collectors.toList());

        List<SearchResponseDto.ProductDto> premiumProducts = premiumPreview.stream()
                .map(p -> new SearchResponseDto.ProductDto(p.getId(), p.getName(), p.getCategory(), p.getPrice()))
                .collect(Collectors.toList());

        List<SearchResponseDto.CategoryStat> categoryStats = rawStats.stream()
                .map(row -> new SearchResponseDto.CategoryStat(
                        (String) row[0],
                        ((Number) row[1]).doubleValue(),
                        ((Number) row[2]).longValue()))
                .collect(Collectors.toList());

        Object[] rawPriceSummary = rawPriceSummaryRows.isEmpty()
                ? new Object[]{null, null, null}
                : rawPriceSummaryRows.get(0);

        SearchResponseDto.PriceSummary priceSummary = new SearchResponseDto.PriceSummary(
                rawPriceSummary[0] == null ? null : ((Number) rawPriceSummary[0]).intValue(),
                rawPriceSummary[1] == null ? null : ((Number) rawPriceSummary[1]).intValue(),
                rawPriceSummary[2] == null ? 0.0 : ((Number) rawPriceSummary[2]).doubleValue()
        );

        long durationMs = System.currentTimeMillis() - start;

        SearchResponseDto response = new SearchResponseDto();
        response.setCategory(category);
        response.setPriceRange(new SearchResponseDto.PriceRange(minPrice, maxPrice));
        response.setPage(new SearchResponseDto.PageInfo(page, normalizedSize));
        response.setMatchedCount(searchPage.getTotalElements());
        response.setTotalInCategory(totalInCategory);
        response.setPriceSummary(priceSummary);
        response.setProducts(products);
        response.setPremiumProducts(premiumProducts);
        response.setTopCategories(categoryStats);
        response.setDurationMs(durationMs);

        log.debug(
                "searchProducts category={} minPrice={} maxPrice={} page={} size={} matchedCount={} durationMs={}",
                category,
                minPrice,
                maxPrice,
                page,
                normalizedSize,
                searchPage.getTotalElements(),
                durationMs
        );

        return response;
    }
}
