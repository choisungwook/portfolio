package com.akbun.codebuild.controller;

import com.example.welcome.WelcomeMessage;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WelcomeController {

  @GetMapping("/")
  public String home() {
    return "CodeBuild Demo Application is running!";
  }

  @GetMapping("/welcome")
  public String welcome() {
    return WelcomeMessage.getWelcome();
  }

  @GetMapping("/health")
  public String health() {
    return "OK";
  }
}
