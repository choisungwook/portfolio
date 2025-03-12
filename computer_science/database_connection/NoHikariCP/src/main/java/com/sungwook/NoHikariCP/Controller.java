package com.sungwook.NoHikariCP;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

@RestController
public class Controller {
    private static final Logger logger = LoggerFactory.getLogger(Controller.class);

    @Value("${spring.datasource.url}")
    private String url;

    @Value("${spring.datasource.username}")
    private String username;

    @Value("${spring.datasource.password}")
    private String password;

    @GetMapping("/")
    public String index() {
        return "Hello, World!";
    }

    @GetMapping("/query")
    public ResponseEntity<QueryResponse> executeQuery() {
        try (Connection conn = DriverManager.getConnection(url, username, password);
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery("SELECT actor_id, first_name, last_name FROM actor")) {

            List<ActorDTO> actors = new ArrayList<>();
            while (rs.next()) {
                actors.add(
                    new ActorDTO(
                        rs.getInt("actor_id"),
                        rs.getString("first_name"),
                        rs.getString("last_name")
                    )
                );
            }
            return ResponseEntity.ok(new QueryResponse(actors));
        } catch (SQLException e) {
            logger.error("Error: " + e.getMessage());

            throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR, "An error occurred while executing the query"
            );
        }
    }
}
