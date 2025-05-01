package com.akbun.readiness;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/query")
public class QueryController {
    @Autowired
    private JdbcTemplate jdbcTemplate; // JdbcTemplate 자동 주입

    // RowMapper 정의: ResultSet의 각 행을 Sbtest1Dto 객체로 매핑하는 로직
    private static final RowMapper<Sbtest1Dto> SBTEST1_ROW_MAPPER = (rs, rowNum) -> new Sbtest1Dto(
            rs.getInt("id"),
            rs.getInt("k"),
            rs.getString("c"),
            rs.getString("pad")
    );

    /**
     * k 값을 기준으로 sbtest1 테이블 조회
     * 예: /query/by-k?k=4992833
     *
     * @param k 조회할 k 값 (Query Parameter)
     * @return 조회 결과 리스트
     */
    @GetMapping("/by-k")
    public List<Sbtest1Dto> getSbtest1ByK(@RequestParam Integer k) {
        // 파라미터 바인딩을 사용하여 SQL Injection 방지
        String sql = "SELECT id, k, c, pad FROM sbtest1 WHERE k = ?";
        return jdbcTemplate.query(sql, SBTEST1_ROW_MAPPER, k);
    }

    /**
     * c 값을 기준으로 sbtest1 테이블 조회
     * 예: /query/by-c?c=73754818686-04889373966-....
     *
     * @param c 조회할 c 값 (Query Parameter)
     * @return 조회 결과 리스트
     */
    @GetMapping("/by-c")
    public List<Sbtest1Dto> getSbtest1ByC(@RequestParam String c) {
        // 파라미터 바인딩 사용
        String sql = "SELECT id, k, c, pad FROM sbtest1 WHERE c = ?";
        return jdbcTemplate.query(sql, SBTEST1_ROW_MAPPER, c);
    }
}
