package com.example.dbpool.service;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;

@Service
public class SlowQueryService {

  @PersistenceContext
  private EntityManager entityManager;

  private final HikariDataSource dataSource;

  public SlowQueryService(DataSource dataSource) {
    this.dataSource = (HikariDataSource) dataSource;
  }

  @Transactional(readOnly = true)
  public String fastQuery() {
    Object result = entityManager
      .createNativeQuery("SELECT 1")
      .getSingleResult();
    return "fast query result: " + result;
  }

  @Transactional(readOnly = true)
  public String slowQuery(int seconds) {
    Object result = entityManager
      .createNativeQuery("SELECT SLEEP(:seconds)")
      .setParameter("seconds", seconds)
      .getSingleResult();
    return "slow query done after " + seconds + "s, result: " + result;
  }

  public String getPoolStatus() {
    HikariPoolMXBean poolBean = dataSource.getHikariPoolMXBean();
    return String.format(
      "active=%d, idle=%d, waiting=%d, total=%d",
      poolBean.getActiveConnections(),
      poolBean.getIdleConnections(),
      poolBean.getThreadsAwaitingConnection(),
      poolBean.getTotalConnections()
    );
  }
}
