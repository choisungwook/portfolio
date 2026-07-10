package com.akbun.elasticache.cache;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/cache")
public class CacheController {

  private final CacheService cacheService;

  public CacheController(CacheService cacheService) {
    this.cacheService = cacheService;
  }

  @PutMapping("/{key}")
  public ResponseEntity<Void> put(
      @PathVariable String key,
      @Valid @RequestBody CacheValueRequest request
  ) {
    cacheService.put(key, request.value());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/{key}")
  public CacheValueResponse get(@PathVariable String key) {
    String value = cacheService.get(key)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    return new CacheValueResponse(key, value);
  }
}
