package com.example.dbpool.controller;

import com.example.dbpool.service.SlowQueryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PoolTestController {

  private final SlowQueryService slowQueryService;

  public PoolTestController(SlowQueryService slowQueryService) {
    this.slowQueryService = slowQueryService;
  }

  @GetMapping("/fast")
  public String fast() {
    return slowQueryService.fastQuery();
  }

  @GetMapping("/slow")
  public String slow(@RequestParam(defaultValue = "10") int seconds) {
    return slowQueryService.slowQuery(seconds);
  }

  @GetMapping("/pool-status")
  public String poolStatus() {
    return slowQueryService.getPoolStatus();
  }
}
