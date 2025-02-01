import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import HomePage from './components/HomePage'
import WaitingRoom from './components/WaitingRoom'

function App() {

  return (
    <BrowserRouter>
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <Routes>
          <Route path="/" element={<HomePage/>}></Route>
          <Route path="/waiting" element={<WaitingRoom/>}></Route>
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
