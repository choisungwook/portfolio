package com.akbun.capacity;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/** Saturation and traffic counters, the numbers a real service exports to CloudWatch. */
class Counters {

  final AtomicInteger inFlight = new AtomicInteger();
  final AtomicInteger peakInFlight = new AtomicInteger();
  final AtomicInteger waiting = new AtomicInteger();
  final AtomicInteger peakWaiting = new AtomicInteger();
  final AtomicLong served = new AtomicLong();
  final AtomicLong cacheHits = new AtomicLong();
  final AtomicLong rejected = new AtomicLong();
  final AtomicLong failed = new AtomicLong();

  void enter() {
    peak(peakInFlight, inFlight.incrementAndGet());
  }

  void leave() {
    inFlight.decrementAndGet();
    served.incrementAndGet();
  }

  void beginWait() {
    peak(peakWaiting, waiting.incrementAndGet());
  }

  void endWait() {
    waiting.decrementAndGet();
  }

  private void peak(AtomicInteger high, int current) {
    high.accumulateAndGet(current, Math::max);
  }

  Map<String, Number> snapshot() {
    Map<String, Number> out = new LinkedHashMap<>();
    out.put("in_flight", inFlight.get());
    out.put("peak_in_flight", peakInFlight.get());
    out.put("waiting", waiting.get());
    out.put("peak_waiting", peakWaiting.get());
    out.put("served", served.get());
    out.put("cache_hits", cacheHits.get());
    out.put("rejected", rejected.get());
    out.put("failed", failed.get());
    return out;
  }

  void reset() {
    peakInFlight.set(inFlight.get());
    peakWaiting.set(waiting.get());
    served.set(0);
    cacheHits.set(0);
    rejected.set(0);
    failed.set(0);
  }
}
