package com.sungwook.HikariCP;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
public class Controller {
    private final JdbcTemplate jdbcTemplate;

    public Controller(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/")
    public ResponseEntity<String> hello() {
        return ResponseEntity.ok("Hello, World!");
    }

    @GetMapping("/query")
    public ResponseEntity<QueryResponse> executeQuery() {
        try {
            String sql = "SELECT actor_id, first_name, last_name FROM actor";

            List<ActorDTO> actors = jdbcTemplate.query(sql, actorRowMapper);

            return ResponseEntity.ok(new QueryResponse(actors));
        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "An error occurred while executing the query", e
            );
        }
    }

    private static final RowMapper<ActorDTO> actorRowMapper = (rs, rowNum) -> new ActorDTO(
            rs.getInt("actor_id"),
            rs.getString("first_name"),
            rs.getString("last_name")
    );
}
