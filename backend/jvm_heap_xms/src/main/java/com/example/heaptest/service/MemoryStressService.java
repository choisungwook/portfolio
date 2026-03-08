package com.example.heaptest.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MemoryStressService {

    /**
     * 대량의 byte 배열을 할당하고 즉시 해제한다.
     * Xms < Xmx 환경에서는 힙이 초기 크기(Xms)에서 시작하므로,
     * 할당 시 힙 확장(heap resizing)이 발생하고 이로 인해 GC 오버헤드가 커진다.
     * Xms == Xmx 환경에서는 이미 전체 힙이 확보되어 있어 리사이징이 없다.
     */
    public Map<String, Object> allocateAndRelease(int sizeMb, int count) {
        Runtime rt = Runtime.getRuntime();
        long beforeUsed = rt.totalMemory() - rt.freeMemory();
        long startTime = System.nanoTime();

        for (int i = 0; i < count; i++) {
            byte[] data = new byte[sizeMb * 1024 * 1024];
            // 할당 직후 참조 해제 → GC 대상
            data[0] = 1;
        }

        long elapsed = (System.nanoTime() - startTime) / 1_000_000;
        long afterUsed = rt.totalMemory() - rt.freeMemory();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "allocate_and_release");
        result.put("sizeMb", sizeMb);
        result.put("count", count);
        result.put("elapsedMs", elapsed);
        result.put("heapUsedBeforeMb", beforeUsed / (1024 * 1024));
        result.put("heapUsedAfterMb", afterUsed / (1024 * 1024));
        result.put("heapTotalMb", rt.totalMemory() / (1024 * 1024));
        result.put("heapMaxMb", rt.maxMemory() / (1024 * 1024));
        return result;
    }

    /**
     * byte 배열을 할당하고 일정 시간 동안 참조를 유지한다.
     * 동시 요청이 많을수록 힙 사용량이 누적되어,
     * Xms < Xmx 환경에서는 힙 확장과 GC가 빈번하게 발생한다.
     */
    public Map<String, Object> allocateAndHold(int sizeMb, int holdMs) {
        Runtime rt = Runtime.getRuntime();
        long beforeUsed = rt.totalMemory() - rt.freeMemory();
        long startTime = System.nanoTime();

        // 리스트에 담아 GC 되지 않도록 유지
        List<byte[]> holder = new ArrayList<>();
        holder.add(new byte[sizeMb * 1024 * 1024]);

        try {
            Thread.sleep(holdMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        long elapsed = (System.nanoTime() - startTime) / 1_000_000;
        long afterUsed = rt.totalMemory() - rt.freeMemory();

        // 참조 해제
        holder.clear();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "allocate_and_hold");
        result.put("sizeMb", sizeMb);
        result.put("holdMs", holdMs);
        result.put("elapsedMs", elapsed);
        result.put("heapUsedBeforeMb", beforeUsed / (1024 * 1024));
        result.put("heapUsedAfterMb", afterUsed / (1024 * 1024));
        result.put("heapTotalMb", rt.totalMemory() / (1024 * 1024));
        result.put("heapMaxMb", rt.maxMemory() / (1024 * 1024));
        return result;
    }

    /**
     * 현재 JVM 힙 메모리 상태를 반환한다.
     */
    public Map<String, Object> getHeapInfo() {
        Runtime rt = Runtime.getRuntime();
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("heapMaxMb", rt.maxMemory() / (1024 * 1024));
        info.put("heapTotalMb", rt.totalMemory() / (1024 * 1024));
        info.put("heapUsedMb", (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024));
        info.put("heapFreeMb", rt.freeMemory() / (1024 * 1024));
        return info;
    }
}
