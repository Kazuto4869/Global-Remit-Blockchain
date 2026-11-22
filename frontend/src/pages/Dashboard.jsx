import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { PageHeading, StatusBadge } from '../components/ui.jsx'

const assets = ['VNDDEMO', 'USDDEMO', 'XLM']
const transactionDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

export default function Dashboard({ token, wallet, openProfile }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const publicKey = wallet?.publicKey

  useEffect(() => {
    const controller = new AbortController()
    const options = { token, signal: controller.signal }
    Promise.allSettled([publicKey ? api('/wallet', options) : null, api('/transfers', options)])
      .then(([balance, history]) => {
        if (controller.signal.aborted) return
        setData({
          balances: balance.value?.balances,
          balanceError: balance.reason?.message,
          transfers: history.value?.transfers,
          historyError: history.reason?.message,
        })
        setLoading(false)
      })
    return () => controller.abort()
  }, [publicKey, token, revision])

  function refresh() {
    setLoading(true)
    setRevision((previous) => previous + 1)
  }

  return (
    <>
      <PageHeading title="Dashboard"
        description="Số dư được đọc trực tiếp từ Horizon Testnet cùng 20 giao dịch đã gửi gần nhất.">
        <button type="button" className="secondary" disabled={loading} onClick={refresh}>
          {loading ? 'Đang tải…' : 'Tải lại'}
        </button>
      </PageHeading>
      <div className="split-wide">
        <section className="card card-dark">
          <div className="card-head"><h3>Số dư Stellar</h3></div>
          {wallet ? (
            <>
              <a className="key-box hash" href={wallet.explorerUrl} target="_blank" rel="noreferrer">
                {publicKey}<small>Mở trên Stellar Explorer ↗</small>
              </a>
              {data?.balanceError && <p role="alert">{data.balanceError}</p>}
              {data?.balances && (
                <dl className="balances">
                  {assets.map((asset) => {
                    const balance = data.balances.find((line) => line.assetCode === asset)?.balance
                    return (
                      <div key={asset}>
                        <dt>{asset}</dt>
                        <dd className={balance === undefined ? 'empty' : undefined}>{balance ?? 'Chưa có trustline'}</dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </>
          ) : (
            <div className="notice">
              <p>Bạn chưa có ví Stellar Testnet.</p>
              <button type="button" className="secondary" onClick={openProfile}>Mở Hồ sơ &amp; KYC</button>
            </div>
          )}
        </section>
        <section className="card card-coral rate-card">
          <p className="eyebrow">Tỷ giá tham chiếu</p>
          <p className="rate">1 USDDEMO = 25.000 VNDDEMO</p>
          <p>Tỷ giá demo cố định. Phí mạng thực tế tính riêng bằng XLM.</p>
        </section>
      </div>
      <section className="card section-gap">
        <div className="card-head"><h3>Lịch sử đã gửi</h3></div>
        {loading && <p className="loading" role="status">Đang lấy dữ liệu…</p>}
        {data?.historyError && <p role="alert">{data.historyError}</p>}
        {data?.transfers?.length === 0 && <p className="empty-state">Chưa có giao dịch đã gửi.</p>}
        {data?.transfers?.length > 0 && (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Bảng lịch sử đã gửi">
            <table>
              <thead>
                <tr><th>Giao dịch</th><th>Số tiền</th><th>Trạng thái</th><th>Phí mạng</th><th>Hash Testnet</th></tr>
              </thead>
              <tbody>
                {data.transfers.map((item) => (
                  <tr key={item.id}>
                    <td><strong>#{item.id} · {item.type}</strong><small>{transactionDate.format(new Date(item.createdAt))}</small></td>
                    <td>{item.sendAmount} {item.sendAsset}{item.receivedAmount && <small>Nhận {item.receivedAmount} {item.destAsset}</small>}</td>
                    <td><StatusBadge status={item.status} />{item.error && <small>{item.error}</small>}</td>
                    <td className="money">{item.feeXlm === null ? '—' : `${item.feeXlm} XLM`}</td>
                    <td>{item.explorerUrl ? (
                      <a className="hash" title="Xem trên Stellar Explorer Testnet" href={item.explorerUrl}
                        target="_blank" rel="noreferrer">{item.txHash}</a>
                    ) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
