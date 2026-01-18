package com.rds.iam_auth.dto;

import com.rds.iam_auth.entity.User;
import java.time.LocalDateTime;

public record UserDto(
  Long id,
  String name,
  String email,
  LocalDateTime createdAt
) {
  public static UserDto from(User user) {
    return new UserDto(
      user.getId(),
      user.getName(),
      user.getEmail(),
      user.getCreatedAt()
    );
  }
}
