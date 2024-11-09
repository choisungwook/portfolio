package sungwook.redis.connection_test;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ConnectionTestApplication {

	public static void main(String[] args) {
		SpringApplication.run(ConnectionTestApplication.class, args);
	}

}
