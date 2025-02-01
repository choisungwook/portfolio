import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import HomePage from './components/HomePage'
import WaitingRoom from './components/WaitingRoom'
import PurchaseTicket from './components/PurchaseTicket'

function App() {

  return (
    <BrowserRouter>
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <Routes>
          <Route path="/" element={<HomePage/>}></Route>
          <Route path="/waiting" element={<WaitingRoom/>}></Route>
          <Route path="/purchase" element={<PurchaseTicket/>}></Route>
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
