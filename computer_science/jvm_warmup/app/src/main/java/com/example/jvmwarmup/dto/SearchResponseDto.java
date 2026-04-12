package com.example.jvmwarmup.dto;

import java.util.List;

public class SearchResponseDto {

    private String category;
    private PriceRange priceRange;
    private PageInfo page;
    private long matchedCount;
    private long totalInCategory;
    private long durationMs;
    private boolean warmupEnabled;
    private PriceSummary priceSummary;
    private List<ProductDto> products;
    private List<ProductDto> premiumProducts;
    private List<CategoryStat> topCategories;

    public static class PriceRange {
        private int min;
        private int max;

        public PriceRange() {
        }

        public PriceRange(int min, int max) {
            this.min = min;
            this.max = max;
        }

        public int getMin() {
            return min;
        }

        public void setMin(int min) {
            this.min = min;
        }

        public int getMax() {
            return max;
        }

        public void setMax(int max) {
            this.max = max;
        }
    }

    public static class PageInfo {
        private int number;
        private int size;

        public PageInfo() {
        }

        public PageInfo(int number, int size) {
            this.number = number;
            this.size = size;
        }

        public int getNumber() {
            return number;
        }

        public void setNumber(int number) {
            this.number = number;
        }

        public int getSize() {
            return size;
        }

        public void setSize(int size) {
            this.size = size;
        }
    }

    public static class ProductDto {
        private Long id;
        private String name;
        private String category;
        private int price;

        public ProductDto() {
        }

        public ProductDto(Long id, String name, String category, int price) {
            this.id = id;
            this.name = name;
            this.category = category;
            this.price = price;
        }

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getCategory() {
            return category;
        }

        public void setCategory(String category) {
            this.category = category;
        }

        public int getPrice() {
            return price;
        }

        public void setPrice(int price) {
            this.price = price;
        }
    }

    public static class CategoryStat {
        private String category;
        private double averagePrice;
        private long productCount;

        public CategoryStat() {
        }

        public CategoryStat(String category, double averagePrice, long productCount) {
            this.category = category;
            this.averagePrice = averagePrice;
            this.productCount = productCount;
        }

        public String getCategory() {
            return category;
        }

        public void setCategory(String category) {
            this.category = category;
        }

        public double getAveragePrice() {
            return averagePrice;
        }

        public void setAveragePrice(double averagePrice) {
            this.averagePrice = averagePrice;
        }

        public long getProductCount() {
            return productCount;
        }

        public void setProductCount(long productCount) {
            this.productCount = productCount;
        }
    }

    public static class PriceSummary {
        private Integer minPrice;
        private Integer maxPrice;
        private double averagePrice;

        public PriceSummary() {
        }

        public PriceSummary(Integer minPrice, Integer maxPrice, double averagePrice) {
            this.minPrice = minPrice;
            this.maxPrice = maxPrice;
            this.averagePrice = averagePrice;
        }

        public Integer getMinPrice() {
            return minPrice;
        }

        public void setMinPrice(Integer minPrice) {
            this.minPrice = minPrice;
        }

        public Integer getMaxPrice() {
            return maxPrice;
        }

        public void setMaxPrice(Integer maxPrice) {
            this.maxPrice = maxPrice;
        }

        public double getAveragePrice() {
            return averagePrice;
        }

        public void setAveragePrice(double averagePrice) {
            this.averagePrice = averagePrice;
        }
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public PriceRange getPriceRange() {
        return priceRange;
    }

    public void setPriceRange(PriceRange priceRange) {
        this.priceRange = priceRange;
    }

    public PageInfo getPage() {
        return page;
    }

    public void setPage(PageInfo page) {
        this.page = page;
    }

    public long getMatchedCount() {
        return matchedCount;
    }

    public void setMatchedCount(long matchedCount) {
        this.matchedCount = matchedCount;
    }

    public long getTotalInCategory() {
        return totalInCategory;
    }

    public void setTotalInCategory(long totalInCategory) {
        this.totalInCategory = totalInCategory;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public boolean isWarmupEnabled() {
        return warmupEnabled;
    }

    public void setWarmupEnabled(boolean warmupEnabled) {
        this.warmupEnabled = warmupEnabled;
    }

    public PriceSummary getPriceSummary() {
        return priceSummary;
    }

    public void setPriceSummary(PriceSummary priceSummary) {
        this.priceSummary = priceSummary;
    }

    public List<ProductDto> getProducts() {
        return products;
    }

    public void setProducts(List<ProductDto> products) {
        this.products = products;
    }

    public List<ProductDto> getPremiumProducts() {
        return premiumProducts;
    }

    public void setPremiumProducts(List<ProductDto> premiumProducts) {
        this.premiumProducts = premiumProducts;
    }

    public List<CategoryStat> getTopCategories() {
        return topCategories;
    }

    public void setTopCategories(List<CategoryStat> topCategories) {
        this.topCategories = topCategories;
    }
}
