import { useRef, useState } from 'react'
import { api } from '../api.js'
import { PageHeading, StatusBadge } from '../components/ui.jsx'

export default function TestnetTransfer({ token, publicKey, approved, refreshing, openProfile }) {
  const storageKey = `globalremit:direct:${publicKey}`
  const [request, setRequest] = useState(() => JSON.parse(sessionStorage.getItem(storageKey)))
  const [type, setType] = useState('DIRECT')
  const [transfer, setTransfer] = useState(null)
  const [trustline, setTrustline] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const acting = useRef(false)

  function remember(next) {
    // Giữ nguyên khóa yêu cầu nếu trình duyệt mất phản hồi hoặc tải lại trang.
    if (next) sessionStorage.setItem(storageKey, JSON.stringify(next))
    else sessionStorage.removeItem(storageKey)
    setRequest(next)
  }

  function start() {
    if (acting.current) return false
    acting.current = true
    setBusy(true)
    setError('')
    return true
  }

  function finish() {
    acting.current = false
    setBusy(false)
  }

  async function send(request, isNew = false) {
    if (!start()) return
    setTransfer(null)
    try {
      if (isNew) remember(request)
      const { transfer } = await api('/transfers', { token, ...request })
      setTransfer(transfer)
      if (transfer.status !== 'PENDING') remember(null)
    } catch (error) {
      const result = error.data?.transfer
      if (result) setTransfer(result)
      else setError(error.data?.transferId ? `${error.message} ID ${error.data.transferId}.` : error.message)
      if (result || (error.status === 400 || error.status === 409)) remember(null)
    } finally {
      finish()
    }
  }

  function submit(event) {
    event.preventDefault()
    if (acting.current || request || !approved) return
    const { destination, amount, destMin } = Object.fromEntries(new FormData(event.currentTarget))
    const next = {
      requestKey: crypto.randomUUID(),
      body: { type, assetCode: 'VNDDEMO', destination: destination.trim(), amount, ...(type === 'PATH' && { destMin }) },
    }
    send(next, true)
  }

  async function lookup(event) {
    event.preventDefault()
    if (!start()) return
    const id = new FormData(event.currentTarget).get('transferId')
    setTransfer(null)
    try {
      const { transfer } = await api(`/transfers/${id}`, { token })
      setTransfer(transfer)
      if (transfer.requestKey === request?.requestKey && transfer.status !== 'PENDING') remember(null)
    } catch (error) {
      setError(error.message)
    } finally {
      finish()
    }
  }

  async function addTrustline(event) {
    event.preventDefault()
    if (!approved || !start()) return
    const assetCode = new FormData(event.currentTarget).get('assetCode')
    setTrustline(null)
    try {
      setTrustline(await api('/wallet/trustlines', { token, body: { assetCode } }))
    } catch (error) {
      setError(error.message)
    } finally {
      finish()
    }
  }

  const ready = publicKey && approved

  return (
    <>
      <PageHeading title="Chuyển tiền"
        description="Gửi VNDDEMO trực tiếp hoặc qua offer đổi sang USDDEMO trên Stellar Testnet. Giao dịch được backend ký thay bằng ví custodial." />
      {refreshing && <p className="loading" role="status">Đang kiểm tra hồ sơ…</p>}
      {!refreshing && !ready && (
        <section className="card notice">
          <p>Cần có ví Stellar Testnet và KYC đã duyệt để gửi tiền.</p>
          <button type="button" className="secondary" onClick={openProfile}>Mở Hồ sơ &amp; KYC</button>
        </section>
      )}
      <div className={ready ? 'split-wide' : undefined}>
        <div className="stack">
          {ready && (
            <section className="card">
              <div className="card-head"><h3>Gửi VNDDEMO</h3></div>
              {!request && (
                <form onSubmit={submit}>
                  <fieldset className="segmented">
                    <legend>Loại giao dịch</legend>
                    <label>
                      <input type="radio" name="type" value="DIRECT" checked={type === 'DIRECT'} onChange={() => setType('DIRECT')} />
                      DIRECT · VNDDEMO → VNDDEMO
                    </label>
                    <label>
                      <input type="radio" name="type" value="PATH" checked={type === 'PATH'} onChange={() => setType('PATH')} />
                      PATH · VNDDEMO → USDDEMO
                    </label>
                  </fieldset>
                  <label>Địa chỉ ví nhận <input name="destination" maxLength={56} required /></label>
                  <div className={type === 'PATH' ? 'form-row' : undefined}>
                    <label>Số tiền VNDDEMO <input name="amount" inputMode="decimal" placeholder={type === 'PATH' ? '250000' : '50000'} required /></label>
                    {type === 'PATH' && (
                      <label>USDDEMO tối thiểu <input name="destMin" inputMode="decimal" defaultValue="9.9" required /></label>
                    )}
                  </div>
                  <button disabled={busy}>{type === 'PATH' ? 'Gửi PATH' : 'Gửi VNDDEMO'}</button>
                </form>
              )}
            </section>
          )}
          {request && (
            <section className="card notice warn">
              <p>Có một yêu cầu gửi đang chờ xác nhận kết quả. Hãy kiểm tra trước khi tạo yêu cầu mới.</p>
              <button type="button" className="secondary" disabled={busy} onClick={() => send(request)}>Kiểm tra yêu cầu gửi</button>
            </section>
          )}
          {busy && <p className="loading" role="status">Đang xử lý…</p>}
          {error && <p role="alert">{error}</p>}
          {transfer && (
            <section className="card card-dark receipt" role="status">
              <div className="card-head">
                <h3>Giao dịch #{transfer.id} · {transfer.type}</h3>
                <StatusBadge status={transfer.status} />
              </div>
              <dl>
                <div><dt>Gửi</dt><dd>{transfer.sendAmount} {transfer.sendAsset}</dd></div>
                {transfer.destMin && <div><dt>Nhận tối thiểu</dt><dd>{transfer.destMin} {transfer.destAsset}</dd></div>}
                {transfer.receivedAmount && <div><dt>Đã nhận</dt><dd>{transfer.receivedAmount} {transfer.destAsset}</dd></div>}
                <div><dt>Ví nhận</dt><dd className="mono">{transfer.destination}</dd></div>
                {transfer.feeXlm && <div><dt>Phí</dt><dd>{transfer.feeXlm} XLM</dd></div>}
                {transfer.error && <div><dt>Lỗi</dt><dd>{transfer.errorCode && `${transfer.errorCode} · `}{transfer.error}</dd></div>}
                {transfer.explorerUrl && (
                  <div><dt>Hash</dt><dd><a className="hash" title="Xem trên Stellar Explorer Testnet" href={transfer.explorerUrl}
                    target="_blank" rel="noreferrer">{transfer.txHash}</a></dd></div>
                )}
              </dl>
            </section>
          )}
        </div>
        {ready && (
          <div className="stack">
            <section className="card card-cream">
              <div className="card-head"><h3>Trustline</h3></div>
              <form className="form-inline" onSubmit={addTrustline}>
                <label>Tài sản <select name="assetCode"><option>VNDDEMO</option><option>USDDEMO</option></select></label>
                <button className="secondary" disabled={busy}>Tạo trustline</button>
              </form>
              {trustline && (
                <p className="notice success" role="status">
                  Trustline {trustline.assetCode} đã sẵn sàng.
                  {trustline.explorerUrl && <> <a href={trustline.explorerUrl} target="_blank" rel="noreferrer">Xem trên Explorer</a></>}
                </p>
              )}
            </section>
            <section className="card card-cream">
              <div className="card-head"><h3>Tra cứu giao dịch đã gửi</h3></div>
              <form className="form-inline" onSubmit={lookup}>
                <label>ID giao dịch <input name="transferId" inputMode="numeric" pattern="[0-9]+" required /></label>
                <button className="secondary" disabled={busy}>Tra cứu</button>
              </form>
            </section>
          </div>
        )}
      </div>
    </>
  )
}
