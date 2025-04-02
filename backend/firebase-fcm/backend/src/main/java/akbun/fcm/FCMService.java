package akbun.fcm;

import com.google.api.core.ApiFuture;
import com.google.api.core.ApiFutureCallback;
import com.google.api.core.ApiFutures;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.common.util.concurrent.MoreExecutors;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.Notification;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Paths;

@Service
@Slf4j
public class FCMService {
    @Value("${fcm.fireBaseConfigPath}")
    private String fireBaseConfigPath;

    @PostConstruct
    public void initialize() {
        try {
            if (fireBaseConfigPath == null || fireBaseConfigPath.isBlank()) {
                throw new IllegalStateException("FCM config path is not set. Please configure fcm.fireBaseConfigPath in application.yml");
            }

            String absolutePath = Paths.get(System.getProperty("user.dir"), fireBaseConfigPath).toString();
            InputStream inputStream = new FileInputStream(absolutePath);
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(inputStream))
                    .build();
            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(options);
                log.error("Firebase application has been initialized");
            }
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public String senddMessage(PushNotificationRequest request) {
        try {
            Message message = Message.builder()
                    .setToken(request.getToken())
                    .setNotification(Notification.builder()
                            .setTitle(request.getTitle())
                            .setBody(request.getMessage())
                            .build())
                    .build();

            String response = FirebaseMessaging.getInstance().send(message);
            log.debug("Successfully sent message: " + response);

            return response;
        } catch (FirebaseMessagingException e) {
            log.error("Error sending message: " + e.getMessage());
            return null;
        }
    }

    /**
     * Sends a push notification asynchronously in dry run mode.
     * Dry run mode validates the request without actual delivery.
     *
     * @param request The push notification details.
     */
    public void sendMessageAsyncDryRun(PushNotificationRequest request) {
        try {
            Message message = Message.builder()
                    .setToken(request.getToken())
                    .setNotification(Notification.builder()
                            .setTitle(request.getTitle())
                            .setBody(request.getMessage())
                            .build())
                    .build();

            // Set dryRun flag to true
            boolean dryRun = true;
            ApiFuture<String> future = FirebaseMessaging.getInstance().sendAsync(message, dryRun);

            // Add a callback to handle the result asynchronously
            ApiFutures.addCallback(future, new ApiFutureCallback<String>() {
                @Override
                public void onSuccess(String result) {
                    log.info("Successfully validated message in dry run mode: {}", result);
                }

                @Override
                public void onFailure(Throwable t) {
                    if (t instanceof FirebaseMessagingException) {
                        FirebaseMessagingException fme = (FirebaseMessagingException) t;
                        log.error("Error validating message in dry run mode. Code: {}, Message: {}", fme.getMessagingErrorCode(), fme.getMessage());
                    } else {
                        log.error("Unknown error during message validation (async, dryRun): ", t);
                    }
                }
            }, MoreExecutors.directExecutor()); // Use directExecutor for simple tasks or inject an ExecutorService

            log.debug("Submitted message for async validation (dryRun=true) to token: {}", request.getToken());

        } catch (Exception e) {
            // Catch potential errors during message building, before async call
            log.error("Error preparing message for validation: {}", e.getMessage(), e);
        }
    }
}
