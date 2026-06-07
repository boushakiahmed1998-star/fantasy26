import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const { register, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await register(email, password, username)
      navigate('/dashboard')
    } catch {}
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-trophy">🏆</span>
          <h1 className="logo-title">Fantasy Boulzazen</h1>
          <p className="logo-sub">Coupe du Monde 2026</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2 className="form-title">Créer un compte</h2>

          {error && (
            <div className="auth-error" onClick={clearError}>
              <span>⚠ {error}</span>
            </div>
          )}

          <div className="field">
            <label>Nom d'utilisateur</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="MonPseudo"
              required
              minLength={3}
            />
          </div>

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com"
              required
            />
          </div>

          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 caractères"
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>

          <p className="auth-switch">
            Déjà un compte ?{' '}
            <Link to="/login">Se connecter</Link>
          </p>
        </form>
      </div>
    </div>
  )
}