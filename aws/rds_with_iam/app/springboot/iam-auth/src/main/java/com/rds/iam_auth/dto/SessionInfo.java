package com.rds.iam_auth.dto;

public record SessionInfo(
  String currentUser,
  String currentDatabase,
  String authMethod
) {
}
