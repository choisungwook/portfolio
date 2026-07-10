package com.akbun.elasticache.cache;

import jakarta.validation.constraints.NotBlank;

public record CacheValueRequest(@NotBlank String value) {
}
