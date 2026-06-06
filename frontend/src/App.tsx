import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="text-2xl font-bold p-8">Welcome to Fantasy Boulzazen 🏆</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App