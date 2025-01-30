import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import HomePage from './components/HomePage'

function App() {

  return (
    <BrowserRouter>
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <Routes>
          <Route path="/" element={<HomePage/>}></Route>
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
