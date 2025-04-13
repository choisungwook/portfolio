import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const API_BASE_URL = 'https://httpbin.org';

  const handleReserve = async () => {
    if (!name) {
      alert('이름을 입력해주세요');
      return;
    }

    // 대기열 등록
    try {
      const response = await fetch(`${API_BASE_URL}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        alert('예약에 실패했습니다. 다시 시도해주세요. error code: 1');
        throw new Error('Network response was not ok');
      }

      navigate('/waiting');
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
      alert('예약에 실패했습니다. 다시 시도해주세요. error code: 2');
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md w-96">
      <label className="block text-gray-700 mb-2">이름</label>
      <input
        type="text"
        placeholder="이름을 입력하세요"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="border p-2 rounded w-full mb-4"
      />
      <button onClick={handleReserve} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
        예매하기
      </button>
    </div>
  );
};

export default HomePage;
