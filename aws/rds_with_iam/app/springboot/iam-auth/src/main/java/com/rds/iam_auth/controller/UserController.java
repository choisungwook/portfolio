package com.rds.iam_auth.controller;

import com.rds.iam_auth.dto.SessionInfo;
import com.rds.iam_auth.dto.UserDto;
import com.rds.iam_auth.entity.User;
import com.rds.iam_auth.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class UserController {

  private final UserRepository userRepository;

  public UserController(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @GetMapping("/users")
  public ResponseEntity<List<UserDto>> getUsers() {
    List<UserDto> users = userRepository.findAll()
      .stream()
      .map(UserDto::from)
      .toList();
    return ResponseEntity.ok(users);
  }

  @GetMapping("/users/{id}")
  public ResponseEntity<UserDto> getUser(@PathVariable Long id) {
    return userRepository.findById(id)
      .map(UserDto::from)
      .map(ResponseEntity::ok)
      .orElse(ResponseEntity.notFound().build());
  }

  @PostMapping("/users")
  public ResponseEntity<UserDto> createUser(@RequestBody Map<String, String> request) {
    String name = request.get("name");
    String email = request.get("email");

    if (name == null || email == null) {
      return ResponseEntity.badRequest().build();
    }

    User user = new User(name, email);
    User saved = userRepository.save(user);
    return ResponseEntity.ok(UserDto.from(saved));
  }

  @GetMapping("/session")
  public ResponseEntity<SessionInfo> getSessionInfo() {
    String currentUser = userRepository.getCurrentUser();
    String currentDatabase = userRepository.getCurrentDatabase();

    SessionInfo sessionInfo = new SessionInfo(
      currentUser,
      currentDatabase,
      "IAM Authentication"
    );

    return ResponseEntity.ok(sessionInfo);
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, String>> health() {
    return ResponseEntity.ok(Map.of("status", "ok"));
  }
}
