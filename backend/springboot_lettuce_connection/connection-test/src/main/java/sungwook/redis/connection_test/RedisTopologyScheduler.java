package sungwook.redis.connection_test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.ClusterInfo;
import org.springframework.data.redis.connection.RedisClusterNode;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Component
public class RedisTopologyScheduler {
    @Autowired
    private RedisService redisService;

    @Scheduled(fixedRate = 5000) // 5초마다 실행
    public void getClusterTopology() {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        String currentTime = LocalDateTime.now().format(formatter);

        System.out.println(currentTime + "[debug] Cluster Topology");

        ClusterInfo clusterTopology = redisService.getClusterTopology();

        if (clusterTopology == null) {
            System.out.println("[debug] clusterTopology is null");
        } else {
            System.out.println(clusterTopology);
        }
    }

    @Scheduled(fixedRate = 5000) // 5초마다 실행
    public void getClusterNodes() {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        String currentTime = LocalDateTime.now().format(formatter);

        System.out.println(currentTime + " [debug] Cluster Nodes");

        Iterable<RedisClusterNode> clusterNodes = redisService.getClusterNodes();

        if (clusterNodes == null) {
            System.out.println("[debug] clusterNodes is null");
        } else if (!clusterNodes.iterator().hasNext()) {
            System.out.println("[debug] clusterNodes is empty");
        } else {
            clusterNodes.forEach(redisClusterNode -> System.out.println(redisClusterNode));
        }
    }
}
