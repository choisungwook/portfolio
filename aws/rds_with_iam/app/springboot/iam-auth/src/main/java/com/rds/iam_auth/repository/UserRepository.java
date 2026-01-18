package com.rds.iam_auth.repository;

import com.rds.iam_auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, Long> {

  @Query(value = "SELECT CURRENT_USER()", nativeQuery = true)
  String getCurrentUser();

  @Query(value = "SELECT DATABASE()", nativeQuery = true)
  String getCurrentDatabase();
}
