package akbun.fcm;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@CrossOrigin(origins = "*")
@Slf4j
public class FCMController {
    @Autowired
    private FCMService fcmService;

    @PostMapping("/send")
    public ResponseEntity<String> sendPushNotification(@RequestBody PushNotificationRequest request) {
        String result = fcmService.senddMessage(request);

        if (result != null)
            return new ResponseEntity<>("Success to send message", HttpStatus.OK);
        else
            return new ResponseEntity<>("Failed to send message", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @PostMapping("/send-async") // Or maybe rename endpoint to /send-dryrun ?
    public ResponseEntity<String> sendAsyncPushNotification(@RequestBody PushNotificationRequest request) {
        try {
            // Call the asynchronous dry-run method
            fcmService.sendMessageAsyncDryRun(request);

            log.info("Accepted request for message validation (dryRun=true) for token: {}", request.getToken());
            return new ResponseEntity<>("Message validation request accepted (dryRun=true)", HttpStatus.ACCEPTED); // Using 202 Accepted
        } catch (Exception e) {
            log.error("Failed to submit message validation request for token: {}", request.getToken(), e);
            return new ResponseEntity<>("Failed to submit message validation request", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
