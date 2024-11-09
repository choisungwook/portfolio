package sungwook.redis.connection_test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.ClusterInfo;
import org.springframework.data.redis.connection.RedisClusterConnection;
import org.springframework.data.redis.connection.RedisClusterNode;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class RedisService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private RedisConnectionFactory connectionFactory;

    public void saveValue(String key, Object value) {
        redisTemplate.opsForValue().set(key, value);
    }

    public Object getValue(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    public void deleteValue(String key) {
        redisTemplate.delete(key);
    }

    public boolean exists(String key) {
        return redisTemplate.hasKey(key);
    }

    public ClusterInfo getClusterTopology() {
        RedisClusterConnection clusterConnection = connectionFactory.getClusterConnection();
        ClusterInfo clusterInfo = clusterConnection.clusterGetClusterInfo();

        return clusterInfo;
    }

    public Iterable<RedisClusterNode> getClusterNodes() {
        RedisClusterConnection clusterConnection = connectionFactory.getClusterConnection();
        Iterable<RedisClusterNode> redisClusterNodes = clusterConnection.clusterGetNodes();

        return redisClusterNodes;
    }
}
