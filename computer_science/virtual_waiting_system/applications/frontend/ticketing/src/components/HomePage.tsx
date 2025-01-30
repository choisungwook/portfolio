import { useState } from 'react';

function HomePage() {
  const [name, setName] = useState('');

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
      <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
        예매하기
      </button>
    </div>
  );
};

export default HomePage;
