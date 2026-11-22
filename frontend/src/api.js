export async function api(path, { token, body, signal, requestKey } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (requestKey) headers['Idempotency-Key'] = requestKey

  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  })
  if (token && response.status === 401) {
    window.dispatchEvent(new CustomEvent('globalremit:session-expired', { detail: token }))
  }
  const data = await response.json().catch(() => {
    throw new Error('Backend không trả được dữ liệu. Hãy thử lại.')
  })
  if (!response.ok) {
    const message = data.reason === 'KYC_REQUIRED' ? 'Hồ sơ KYC chưa được duyệt.' : data.error
    throw Object.assign(new Error(message || 'Không thể xử lý yêu cầu.'), { status: response.status, data })
  }
  return data
}
