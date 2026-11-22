// Các thành phần giao diện dùng chung cho năm màn hình. Chỉ hiển thị, không chứa logic nghiệp vụ.

// Logo GlobalRemit: vòng tròn coral với mũi tên cong biểu thị dòng tiền qua biên giới.
export function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--color-primary)" />
      <path d="M8.5 20.5c2.6-5.6 8.6-8.4 14.2-6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19.4 10.6 23.4 14.6 18.8 17.4" fill="none" stroke="#fff" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Tiêu đề màn hình: tiêu đề serif, mô tả ngắn và vùng nút thao tác bên phải.
export function PageHeading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        {description && <p className="lead">{description}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

// Nhãn trạng thái; màu lấy theo data-status trong CSS (CONFIRMED, PENDING, FAILED…).
export function StatusBadge({ status, children }) {
  return <span className="badge" data-status={status}>{children ?? status}</span>
}
