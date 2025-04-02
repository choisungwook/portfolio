package akbun.fcm;

import lombok.Builder;
import lombok.Getter;

@Getter
public class PushNotificationRequest {
    private String token;
    private String title;
    private String message;

    @Builder
    public PushNotificationRequest(String token, String title, String message) {
        this.token = token;
        this.title = title;
        this.message = message;
    }
}
