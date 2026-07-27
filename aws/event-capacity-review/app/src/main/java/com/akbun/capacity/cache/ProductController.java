package com.akbun.capacity.cache;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/product")
public class ProductController {

  private final ProductCacheService productCacheService;

  public ProductController(ProductCacheService productCacheService) {
    this.productCacheService = productCacheService;
  }

  @GetMapping("/{id}")
  public ProductResponse get(@PathVariable long id) {
    return productCacheService.read(id);
  }
}
