import { useState } from 'react'
import { api } from '../api.js'

export default function Auth({ onLogin, expired }) {
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      onLogin(await api(register ? '/auth/register' : '/auth/login', { body }))
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <section className="card auth-card" aria-labelledby="auth-title">
        <h2 id="auth-title">{register ? 'Đăng ký' : 'Đăng nhập'}</h2>
        <p className="muted">Dùng email và hồ sơ giả để chạy demo Stellar Testnet.</p>
        {expired && <p role="alert">Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.</p>}
        <form onSubmit={submit}>
          <label>Email demo <input type="email" name="email" autoComplete="username" placeholder="alice@globalremit.test" required /></label>
          <label>
            Mật khẩu
            <input type="password" name="password" autoComplete={register ? 'new-password' : 'current-password'}
              minLength={8} placeholder="Ít nhất 8 ký tự" required />
          </label>
          <button disabled={busy}>{busy ? 'Đang xử lý…' : register ? 'Đăng ký' : 'Đăng nhập'}</button>
        </form>
        {error && <p role="alert">{error}</p>}
        <p className="auth-switch">
          {register ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
          <button type="button" className="link" disabled={busy} onClick={() => { setRegister(!register); setError('') }}>
            {register ? 'Về đăng nhập' : 'Tạo tài khoản demo'}
          </button>
        </p>
        {!register && (
          <p className="demo-accounts">
            Tài khoản seed: <code>alice@</code>, <code>bob@</code>, <code>admin@globalremit.test</code> · mật khẩu <code>12345678</code>
          </p>
        )}
      </section>
    </div>
  )
}
