import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Firebase 웹 앱 설정
// 이 정보는 Firebase 콘솔에서 웹 앱을 등록한 후 확인할 수 있습니다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export const requestForToken = async () => {
  try {
    const currentToken = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
    });

    if (currentToken) {
      console.log("토큰:", currentToken);

      // 토큰을 서버로 전송하여 저장
      await sendTokenToServer(currentToken);

      return currentToken;
    }
  } catch (error) {
    console.error("토큰 요청 중 오류 발생:", error);
  }
}

const sendTokenToServer = async (token) => {
  try {
    const apiUrl = import.meta.env.VITE_APP_API_URL || 'http://localhost:8080';
    const reponse = await fetch(`${apiUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          token,
          title: "토큰 등록",
          message: "디바이스가 알림 서비스에 등록되었습니다.",
        }
      ),
    });

    if (!response.ok) {
      throw new Error('서버 응답 오류');
    }

    console.log("토큰이 서버에 성공적으로 전송되었습니다.");
  } catch (error) {
    console.error("토큰 전송 중 오류 발생:", error);
  }
}

// 포그라운드 메세지 수신 처리
export const onMessageListener = () => {
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log("메시지 수신:", payload);
      resolve(payload);
    });
  });
}
