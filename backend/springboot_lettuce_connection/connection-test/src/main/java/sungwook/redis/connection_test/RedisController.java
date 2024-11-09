package sungwook.redis.connection_test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/redis")
public class RedisController {

    @Autowired
    private RedisService redisService;

    @PostMapping
    public ResponseEntity<String> createOrUpdateValue(@RequestBody Map<String, Object> requestBody) {
        requestBody.forEach((key, value) -> redisService.saveValue(key, value));
        return ResponseEntity.ok("Value saved successfully");
    }

    @GetMapping("/{key}")
    public ResponseEntity<Object> getValue(@PathVariable String key) {
        Object value = redisService.getValue(key);
        if (value != null) {
            return ResponseEntity.ok(value);
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{key}")
    public ResponseEntity<String> deleteValue(@PathVariable String key) {
        if (redisService.exists(key)) {
            redisService.deleteValue(key);
            return ResponseEntity.ok("Value deleted successfully.");
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}
