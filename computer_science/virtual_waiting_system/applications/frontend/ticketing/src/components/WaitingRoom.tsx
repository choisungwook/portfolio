import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function WaitingRoom() {
  const [position, setPosition] = useState<number | null>(null);;
  const navigate = useNavigate();
  const queueInterval = 5000;
  const API_BASE_URL = 'https://httpbin.org';

  useEffect(() => {
    const interval = setInterval(async() =>{
      const response = await fetch(`${API_BASE_URL}/get`);

      if (!response.ok) {
        const errorMessage = `대기열 조회 실패 (HTTP status: ${response.status}). error code: 3`;
        console.error(errorMessage);
        alert(errorMessage + ' 다시 시도해주세요.');
        return;
      }

      const data = await response.json();
      if (data.position === undefined || data.position === null) {
        const errorMessage = `대기열 조회 응답이 올바르지 않습니다. error code: 4`;
        console.error(errorMessage);
        alert(errorMessage + ' 다시 시도해주세요.');
        return;
      }

      setPosition(data.position);

      if (data.position === 1) {
        clearInterval(interval);
        navigate('/tickets');
      }
    }, queueInterval)
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div>
      <p className="text-4xl font-bold">대기 중입니다...</p>
      {position !== null ? <p>현재 순번: {position}</p> : <p> 대기열 조회 중...</p>}
    </div>
  );
}

export default WaitingRoom;
