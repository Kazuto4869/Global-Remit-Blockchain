import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { PageHeading, StatusBadge } from '../components/ui.jsx'

const reasons = {
  LIMIT: 'Vượt hạn mức',
  FREQUENCY: 'Đã đủ 3 lượt trong 24 giờ',
  WATCHLIST: 'Mã hồ sơ thuộc watchlist',
  KYC_REQUIRED: 'Hồ sơ KYC chưa được duyệt',
}

export default function Admin({ token }) {
  const [submissions, setSubmissions] = useState([])
  const [checks, setChecks] = useState([])
  const [decision, setDecision] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [reviewMessage, setReviewMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const options = { token, signal: controller.signal }
    Promise.all([api('/admin/kyc', options), api('/admin/aml?result=FAIL', options)])
      .then(([kyc, aml]) => {
        setSubmissions(kyc.submissions)
        setChecks(aml.checks)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, revision])

  async function review(event, id) {
    event.preventDefault()
    if (busy || loading) return
    const body = Object.fromEntries(new FormData(event.currentTarget, event.nativeEvent.submitter))
    setReviewMessage('')
    setBusy(true)
    setError('')
    try {
      const { submission } = await api(`/admin/kyc/${id}/review`, { token, body })
      setSubmissions((previous) => previous.map((item) => item.id === id ? { ...item, ...submission } : item))
      setReviewMessage(submission.status === 'APPROVED' ? 'Đã duyệt hồ sơ.' : 'Đã từ chối hồ sơ.')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function tryAml(event) {
    event.preventDefault()
    if (busy || loading) return
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    setDecision('')
    try {
      const result = await api('/admin/aml/test', { token, body })
      setDecision(result.reason ? `${result.result} · ${reasons[result.reason]}` : result.result)
    } catch (error) {
      setError(error.message)
    } finally {
      try {
        setChecks((await api('/admin/aml?result=FAIL', { token })).checks)
      } catch (error) {
        setError(error.message)
      }
      setBusy(false)
    }
  }

  function refresh() {
    setError('')
    setLoading(true)
    setRevision((previous) => previous + 1)
  }

  return (
    <>
      <PageHeading title="Admin"
        description="Duyệt hồ sơ KYC, thử các quy tắc AML và theo dõi những lượt kiểm tra bị từ chối.">
        <button type="button" className="secondary" disabled={busy || loading} onClick={refresh}>
          {loading ? 'Đang tải…' : 'Tải lại'}
        </button>
      </PageHeading>
      {error && <p role="alert">{error}</p>}
      {busy && <p className="loading" role="status">Đang xử lý…</p>}
      <section className="card">
        <div className="card-head"><h3>Duyệt KYC</h3></div>
        {reviewMessage && <p className="notice success" role="status">{reviewMessage}</p>}
        {loading && <p className="loading" role="status">Đang tải hồ sơ và kết quả AML…</p>}
        {!loading && !submissions.length && <p className="empty-state">Chưa có hồ sơ.</p>}
        {submissions.length > 0 && (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Bảng hồ sơ KYC">
            <table>
              <thead><tr><th>Email</th><th>Hồ sơ giả</th><th>Trạng thái</th><th>Xét duyệt</th></tr></thead>
              <tbody>
                {submissions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.email}</td>
                    <td>{item.full_name}<small>{item.country} · {item.demo_id}</small></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      {item.status === 'PENDING' ? (
                        <form className="review-form" onSubmit={(event) => review(event, item.id)}>
                          <input name="rejection_reason" aria-label={`Lý do từ chối ${item.email}`}
                            placeholder="Lý do nếu từ chối" maxLength={200} />
                          <div className="actions">
                            <button name="status" value="APPROVED" disabled={busy || loading}>Duyệt</button>
                            <button className="secondary" name="status" value="REJECTED" disabled={busy || loading}>Từ chối</button>
                          </div>
                        </form>
                      ) : item.rejection_reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="stack section-gap">
        <section className="card card-cream">
          <div className="card-head"><h3>Thử AML</h3></div>
          <form onSubmit={tryAml}>
            <label>Email customer <input type="email" name="email" required /></label>
            <div className="form-row">
              <label>Tài sản <select name="assetCode"><option>VNDDEMO</option><option>USDDEMO</option></select></label>
              <label>Số tiền <input name="amount" inputMode="decimal" placeholder="1000000" required /></label>
            </div>
            <button disabled={busy || loading}>Kiểm tra AML</button>
          </form>
          {decision && <p className="notice" role="status">{decision}</p>}
        </section>
        <section className="card">
          <div className="card-head"><h3>Các lượt AML bị từ chối</h3></div>
          {!loading && !checks.length && <p className="empty-state">Chưa có lượt bị từ chối.</p>}
          {checks.length > 0 && (
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Bảng AML bị từ chối">
              <table>
                <thead><tr><th>Email</th><th>Số tiền</th><th>Lý do</th></tr></thead>
                <tbody>
                  {checks.map((item) => (
                    <tr key={item.id}>
                      <td>{item.email}</td>
                      <td>{item.amount} {item.asset_code}</td>
                      <td><StatusBadge status="FAIL">{reasons[item.reason] ?? item.reason}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
