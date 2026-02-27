package com.example.heaptest.controller;

import com.example.heaptest.service.MemoryStressService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HeapTestController {

    private final MemoryStressService memoryStressService;

    public HeapTestController(MemoryStressService memoryStressService) {
        this.memoryStressService = memoryStressService;
    }

    /**
     * 짧은 시간 동안 객체를 대량 할당 후 해제하는 엔드포인트.
     * Xms < Xmx일 때 힙이 반복적으로 확장/축소되며 GC 오버헤드가 발생한다.
     * Xms == Xmx일 때는 힙 리사이징 없이 안정적으로 동작한다.
     *
     * @param sizeMb 할당할 메모리 크기(MB). 기본값 10MB.
     * @param count  할당 반복 횟수. 기본값 50.
     */
    @GetMapping("/allocate")
    public Map<String, Object> allocate(
            @RequestParam(defaultValue = "10") int sizeMb,
            @RequestParam(defaultValue = "50") int count) {
        return memoryStressService.allocateAndRelease(sizeMb, count);
    }

    /**
     * 객체를 일정 시간 유지하여 힙 사용량을 높게 유지하는 엔드포인트.
     * Xms < Xmx일 때 힙 확장이 빈번해지고, GC가 더 자주 발생한다.
     *
     * @param sizeMb   할당할 메모리 크기(MB). 기본값 5MB.
     * @param holdMs   메모리 유지 시간(ms). 기본값 500ms.
     */
    @GetMapping("/hold")
    public Map<String, Object> hold(
            @RequestParam(defaultValue = "5") int sizeMb,
            @RequestParam(defaultValue = "500") int holdMs) {
        return memoryStressService.allocateAndHold(sizeMb, holdMs);
    }

    /**
     * 현재 JVM 힙 메모리 상태를 조회하는 엔드포인트.
     */
    @GetMapping("/heap")
    public Map<String, Object> heapInfo() {
        return memoryStressService.getHeapInfo();
    }
}
