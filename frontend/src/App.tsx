import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Fantasy from './pages/Fantasy'
import Admin from './pages/Admin'
import Pronos from './pages/Pronos'
import Ranking from './pages/Ranking'
import Transfers from './pages/Transfers'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />

        {/* Phase 3 — Fantasy builder */}
        <Route path="/fantasy" element={
          <ProtectedRoute><Fantasy /></ProtectedRoute>
        } />

        {/* Phase 6 — Transferts */}
        <Route path="/transfers" element={
          <ProtectedRoute><Transfers /></ProtectedRoute>
        } />

        {/* Admin panel */}
        <Route path="/admin" element={
          <AdminRoute><Admin /></AdminRoute>
        } />

        {/* Phase 5 — Pronostics & Classement */}
        <Route path="/pronos" element={
          <ProtectedRoute><Pronos /></ProtectedRoute>
        } />
        <Route path="/ranking" element={
          <ProtectedRoute><Ranking /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App