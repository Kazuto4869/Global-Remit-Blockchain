import { useState } from 'react'
import { api } from '../api.js'
import { PageHeading, StatusBadge } from '../components/ui.jsx'

export default function Kyc({ token, profile, onUpdate, refreshing, onRefresh }) {
  const { submission, wallet } = profile
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy || refreshing) return
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { submission } = await api('/kyc', { token, body })
      onUpdate({ ...profile, submission })
      setMessage('Đã nộp hồ sơ. Admin cần xét duyệt trước khi bạn chuyển tiền.')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function createWallet() {
    if (busy || refreshing) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const wallet = await api('/wallet', { token, body: {} })
      onUpdate({ ...profile, wallet })
      setMessage('Ví đã được xác nhận trên Stellar Testnet.')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  function refresh() {
    setError('')
    setMessage('')
    onRefresh()
  }

  const status = submission?.status

  return (
    <>
      <PageHeading title="Hồ sơ & KYC"
        description="Hồ sơ giả lập để admin xét duyệt. Không nhập dữ liệu định danh thật. Ví Testnet chỉ được tạo sau khi KYC được duyệt.">
        <button type="button" className="secondary" disabled={busy || refreshing} onClick={refresh}>
          {refreshing ? 'Đang tải…' : 'Tải trạng thái'}
        </button>
      </PageHeading>
      <div className="split">
        <section className="card">
          <div className="card-head">
            <h3>Hồ sơ KYC</h3>
            <span aria-live="polite"><StatusBadge status={status}>{status ?? 'Chưa nộp hồ sơ'}</StatusBadge></span>
          </div>
          {submission?.rejection_reason && <p className="notice warn">Lý do từ chối: {submission.rejection_reason}</p>}
          <form key={submission?.id} onSubmit={submit} className={submission?.rejection_reason ? 'section-gap' : undefined}>
            <label>Tên giả <input name="full_name" defaultValue={submission?.full_name} placeholder="Alice Demo" maxLength={100} required /></label>
            <div className="form-row">
              <label>Mã quốc gia <input name="country" defaultValue={submission?.country} placeholder="VN" maxLength={2} required /></label>
              <label>Mã hồ sơ giả <input name="demo_id" defaultValue={submission?.demo_id} placeholder="DEMO-ALICE" maxLength={40} required /></label>
            </div>
            <button disabled={busy || refreshing}>{submission ? 'Nộp lại để xét duyệt' : 'Nộp KYC'}</button>
          </form>
        </section>
        <section className="card card-dark">
          <div className="card-head">
            <h3>Ví Stellar Testnet</h3>
            {wallet && <StatusBadge status="CONFIRMED">Đã tạo</StatusBadge>}
          </div>
          {wallet ? (
            <a className="key-box hash" href={wallet.explorerUrl} target="_blank" rel="noreferrer">
              {wallet.publicKey}<small>Mở trên Stellar Explorer ↗</small>
            </a>
          ) : (
            <p>Ví custodial do backend ký thay, chỉ dùng cho demo. Friendbot cấp XLM Testnet khi tạo ví.</p>
          )}
          {status === 'APPROVED' ? (
            <button type="button" className={wallet ? 'secondary' : undefined} disabled={busy || refreshing} onClick={createWallet}>
              {wallet ? 'Kiểm tra lại ví Testnet' : 'Tạo ví Testnet'}
            </button>
          ) : <p className="muted">Cần được duyệt KYC để tạo hoặc kiểm tra lại ví.</p>}
        </section>
      </div>
      {busy && <p className="loading section-gap" role="status">Đang xử lý…</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </>
  )
}
