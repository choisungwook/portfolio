import './App.css'
import { useEffect } from "react";
import { requestForToken, onMessageListener } from './firebase'

function App() {
  useEffect(() => {
    // Firebase 서버에 알림 권한 요청 및 토큰 등록
    requestForToken()

    onMessageListener().then((payload) => {
      alert("메시지 수신:", payload.notification.title);
    });
  }, [])
}

export default App
