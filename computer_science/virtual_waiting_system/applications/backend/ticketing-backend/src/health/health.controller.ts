import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  DiskHealthIndicator,
  MemoryHealthIndicator,
  HttpHealthIndicator
} from '@nestjs/terminus'
import { getHeapStatistics } from 'v8';

@Controller('health')
export class HealthController {
  constructor(
    private healthCheckService: HealthCheckService,
    private diskHealthIndicator: DiskHealthIndicator,
    private memoryHealthIndicator: MemoryHealthIndicator,
    private httpHealthIndicator: HttpHealthIndicator
  ) {}

  /**
   * 현재 프로세스의 최대 heap 크기에 지정한 factor(기본값: 0.9)를 곱한 임계값을 반환합니다.
   * @param factor - 임계치 비율 (예: 0.9)
   * @returns heap 임계값 (바이트 단위)
   */
  async calculateHeapThreshold(): Promise<number> {
    const heapStats = getHeapStatistics();
    return heapStats.heap_size_limit * 0.9;
  }

  @Get('/healthCheck')
  async healthCheck(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  @Get('/liveness')
  @HealthCheck()
  async checkLiveness() {
    return this.healthCheckService.check([
      async () => this.diskHealthIndicator.checkStorage('disk', { thresholdPercent: 0.90, path: '/' }),
      async () => this.memoryHealthIndicator.checkHeap('memory_heap', await this.calculateHeapThreshold()),
    ]);
  }

  @Get('/readiness')
  @HealthCheck()
  async checkReadiness() {
    return this.healthCheckService.check([
      async () => this.httpHealthIndicator.pingCheck('self', 'http://localhost:3000/health/healthCheck'),
    ]);
  }
}
