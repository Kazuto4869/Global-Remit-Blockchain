# GlobalRemit — Mô phỏng chuyển tiền Việt Nam → Mỹ trên Stellar Testnet

GlobalRemit là web app học tập mô phỏng việc chuyển tiền từ Việt Nam sang Mỹ trên **Stellar Testnet**. Người gửi đăng ký, nộp hồ sơ KYC giả và được admin duyệt. Backend kiểm tra **KYC + AML** trước khi ký giao dịch. Sau đó người gửi có thể chuyển `VNDDEMO` trực tiếp cho người nhận (**DIRECT**), hoặc gửi `VNDDEMO` để người nhận nhận `USDDEMO` qua **path payment** (**PATH**). Web hiển thị số dư từ Horizon, phí XLM thực tế, trạng thái, lịch sử và link Stellar Explorer.

> **Lưu ý:** đây là dự án học tập (môn Blockchain). Chỉ dùng Stellar **Testnet**, dữ liệu **giả** và hai tài sản `VNDDEMO`/`USDDEMO` **không có giá trị thật**. Không nhập thông tin định danh thật. Không dùng cho production.

## Tính năng chính

- **YC01 — Đăng ký / đăng nhập:** mật khẩu hash bằng `bcryptjs`, JWT HS256 có hiệu lực 2 giờ, hai vai trò `CUSTOMER` và `ADMIN` (admin chỉ tạo bằng script seed).
- **YC02 — KYC giả lập:** form dữ liệu giả (không upload ảnh giấy tờ), trạng thái `PENDING / APPROVED / REJECTED`, admin duyệt hoặc từ chối kèm lý do.
- **YC03 — AML 3 luật:** hạn mức, tần suất 24 giờ, danh sách cảnh báo (watchlist); admin có công cụ **Thử AML** và xem các lượt bị từ chối.
- **YC04 — Ví Stellar Testnet:** mỗi customer đã `APPROVED` được tạo 1 ví (Friendbot cấp XLM); backend ký thay ví (custodial, chỉ cho demo).
- **YC05 — Hai tài sản:** `VNDDEMO` và `USDDEMO` dùng chung một issuer, phát hành bằng CLI script (`stellar:bootstrap`).
- **YC06 — Trustline và chuyển trực tiếp:** customer tạo trustline qua backend, gửi `payment` DIRECT với hash thật.
- **YC07 — Path payment và thanh khoản:** market maker đặt một offer; PATH gửi `VNDDEMO` để nhận `USDDEMO`, có `destMin`, báo lỗi `NO_LIQUIDITY` / `DEST_MIN`.
- **YC08 — Giao diện tổng hợp:** 5 màn hình, số dư, phí mạng, tỷ giá tham chiếu cố định, lịch sử 20 giao dịch gần nhất và link Explorer.

## Hướng dẫn chạy nhanh

Chạy tất cả lệnh từ root project (giải thích chi tiết ở các phần **Cài đặt** và **Chạy** bên dưới).

1. **Chuẩn bị:** Node.js 24, Docker Desktop (Windows) hoặc Docker Engine (Ubuntu) kèm Compose v2. Trên Windows, mở Docker Desktop và đợi Engine chạy. Trên Ubuntu: `sudo systemctl start docker` nếu cần.
2. **Cài dependency và bật PostgreSQL:**

   ```sh
   npm --prefix backend ci
   npm --prefix frontend ci
   docker compose up -d db
   ```

3. **Tạo `backend/.env`** (bỏ qua nếu đã có):

   ```powershell
   # Windows PowerShell
   if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
   ```

   ```bash
   # Ubuntu
   test -f backend/.env || cp backend/.env.example backend/.env
   ```

4. **Tạo `JWT_SECRET`** (bắt buộc, tối thiểu 32 ký tự). Chạy lệnh dưới rồi dán kết quả vào dòng `JWT_SECRET=` trong `backend/.env`:

   ```sh
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

5. **Tạo schema và tài khoản demo:**

   ```sh
   npm --prefix backend run seed
   ```

6. **Chạy backend và frontend** trong hai terminal riêng:

   ```sh
   npm --prefix backend run dev
   ```

   ```sh
   npm --prefix frontend run dev
   ```

7. Mở `http://localhost:5173`. Cuối trang, **Backend**, **Database** và **Stellar** phải hiện **Connected**.
8. Đăng nhập bằng tài khoản seed (mật khẩu `12345678`): `alice@globalremit.test`, `bob@globalremit.test` (customer) hoặc `admin@globalremit.test` (admin).

### Chuẩn bị dữ liệu Stellar cho demo chuyển tiền

Cần internet (Horizon và Friendbot của Testnet). Làm theo thứ tự:

1. Đăng nhập Alice và Bob, nộp hồ sơ KYC giả. Đăng nhập admin và duyệt cả hai. Mỗi customer vào **Hồ sơ & KYC** bấm **Tạo ví Testnet**.
2. `npm --prefix backend run stellar:bootstrap` — tạo ví hệ thống, phát hành `VNDDEMO` và `USDDEMO`.
3. Trong **Chuyển tiền**, tạo trustline: `VNDDEMO` cho Alice; `VNDDEMO` và `USDDEMO` cho Bob.
4. `npm --prefix backend run stellar:fund-alice` — cấp 500.000 VNDDEMO cho Alice.
5. `npm --prefix backend run stellar:offer` — đặt offer của market maker (cần cho PATH).
6. Gửi thử **DIRECT** (`50000` VNDDEMO) và **PATH** (`250000` VNDDEMO, USDDEMO tối thiểu `9.9`); xem kết quả ở **Dashboard**.

### Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Cổng `55432` đang bận khi `docker compose up -d db` | Đổi cổng host trong `docker-compose.yml` (`"127.0.0.1:55432:5432"`) và cập nhật cùng cổng trong `DATABASE_URL` của `backend/.env`. |
| Docker không chạy / không kết nối được daemon | Mở Docker Desktop và đợi Engine chạy (Ubuntu: `sudo systemctl start docker`), rồi chạy lại `docker compose up -d db`. |
| Backend báo `Đặt JWT_SECRET (ít nhất 32 ký tự) trong backend/.env trước khi chạy.` | Tạo giá trị bằng lệnh ở bước 4, điền vào `JWT_SECRET=` rồi chạy lại backend. |
| Database hiện **Unavailable** (`/api/db/status` trả 503) | Kiểm tra `docker compose up -d db` đã chạy, chờ PostgreSQL sẵn sàng, `DATABASE_URL`/cổng khớp, rồi tải lại trang. |
| Horizon hoặc Friendbot trả 503 / Stellar **Unavailable** | Lỗi tạm thời của Testnet: chờ vài giây và thử lại. Giao dịch `PENDING` thì gửi lại cùng `Idempotency-Key` hoặc bấm **Kiểm tra yêu cầu gửi**. |
| `KYC_REQUIRED` / HTTP 403 | Hồ sơ KYC chưa `APPROVED`: nộp hồ sơ và nhờ admin duyệt. |
| `NO_TRUSTLINE` / `NO_BALANCE` (HTTP 409) | Tạo trustline cho tài sản của bên gửi/nhận và cấp tiền demo (`stellar:fund-alice`). |
| `FREQUENCY` (đã đủ 3 lượt trong 24 giờ) | Dùng một tài khoản customer demo khác (đăng ký email giả mới, KYC và tạo ví lại). |

### Dừng ứng dụng

- Dừng backend và frontend bằng `Ctrl+C` trong từng terminal.
- Dừng PostgreSQL, giữ dữ liệu: `docker compose stop db`.
- **Cẩn thận:** `docker compose down -v` xóa volume `pgdata`, mất toàn bộ dữ liệu database. Kho khóa `backend/.secrets/` không bị xóa, nhưng cần giữ khớp với database.

## Kiến trúc

```text
Browser (React + Vite, :5173)
        |  HTTP/JSON  (Vite proxy /api -> 127.0.0.1:3000)
        v
Backend (Express, 127.0.0.1:3000)
  |  JWT + role  ->  KYC  ->  AML  ->  ký giao dịch
  |            |                          |
  v            v                          v
PostgreSQL   backend/.secrets/        Stellar SDK --> Horizon Testnet
(Docker,     stellar-wallets.json     (horizon-testnet.stellar.org)
 :55432)     (secret key, gitignore)
```

- **Custodial signing:** secret key của issuer, distributor, marketMaker và ví customer nằm trong `backend/.secrets/stellar-wallets.json`; chỉ backend đọc và ký. Frontend, API response và Git không bao giờ chứa secret key.
- **Idempotency:** `POST /api/transfers` nhận header `Idempotency-Key` (UUID). Cùng key và cùng dữ liệu trả lại giao dịch đã có; cùng key khác dữ liệu trả HTTP 409. Giao dịch ghi `PENDING` (kèm envelope đã ký) trước khi gửi, và chỉ chuyển `CONFIRMED` sau khi Horizon xác nhận. Nếu chưa rõ kết quả, gửi lại cùng key hoặc `GET /api/transfers/:id` sẽ tra cứu/gửi lại đúng giao dịch đó.
- **Xử lý số tiền:** số tiền là chuỗi thập phân tối đa 7 số lẻ, đổi sang `BigInt` đơn vị 10^7 (`SCALE = 10_000_000n`, `backend/src/services/amount.js`). Không dùng `Number` floating-point cho số dư, hạn mức hay tỷ giá. Cột PostgreSQL dùng `numeric(20, 7)`.
- Backend luôn kiểm tra đăng nhập, vai trò, KYC và AML, không tin `role`/`userId` do frontend gửi.

## Công nghệ

| Phần | Dùng |
|---|---|
| Frontend | React 19, Vite 8, CSS thường, `fetch`, lint bằng `oxlint` |
| Backend | Node.js 24, Express 5, `zod`, `cors`, `dotenv` |
| Database | PostgreSQL 17 (Docker, volume `pgdata`) + package `pg` |
| Blockchain | Stellar Testnet, `@stellar/stellar-sdk`, Horizon Testnet, Friendbot |
| Đăng nhập | `bcryptjs`, `jsonwebtoken` (JWT) |
| Kiểm thử | Node built-in test runner (`node --test`) + kiểm thử thủ công |

## Cấu trúc thư mục

```text
.
├── README.md
├── PROJECT_PROGRESS.md              # tiến độ và kết quả từng phase
├── GlobalRemit_Codex_7_Phases.md    # đặc tả 7 phase của project
├── docker-compose.yml               # PostgreSQL 17, cổng host 55432
├── .agents/
│   └── skills/
│       ├── SKILL.md                 # skill thiết kế giao diện
│       ├── references/DESIGN.md     # design system warm-editorial
│       └── writing-paper/           # skill viết báo cáo
├── database/
│   └── schema.sql                   # 5 bảng PostgreSQL
├── backend/
│   ├── .env.example
│   ├── .secrets/                    # kho khóa Testnet (gitignore, tự tạo)
│   ├── scripts/
│   │   ├── seed.js                  # schema + tài khoản + watchlist demo
│   │   ├── bootstrap-assets.js      # ví hệ thống + phát hành 2 tài sản
│   │   ├── fund-alice.js            # cấp 500.000 VNDDEMO cho Alice
│   │   └── market-offer.js          # tạo/xóa offer của market maker
│   ├── src/
│   │   ├── server.js                # Express app, mount route
│   │   ├── db.js                    # pool PostgreSQL
│   │   ├── middleware/auth.js       # requireAuth, requireCustomer, requireAdmin
│   │   ├── routes/                  # auth, kyc, wallet, transfers, admin
│   │   └── services/
│   │       ├── aml.js               # 3 luật AML
│   │       ├── amount.js            # số tiền 10^7 BigInt
│   │       ├── walletStore.js       # kho khóa JSON
│   │       ├── stellarService.js    # Horizon, Explorer URL, lỗi chuẩn
│   │       ├── stellarPayments.js   # asset, trustline, reserve, payment
│   │       └── stellarTransactions.js # ký/gửi giao dịch idempotent
│   └── test/                        # health, phase2, stellarFunding
├── frontend/
│   ├── vite.config.js               # proxy /api -> Express
│   └── src/
│       ├── main.jsx, App.jsx        # khung ứng dụng, trạng thái kết nối
│       ├── api.js                   # wrapper fetch + JWT
│       ├── index.css                # style theo design system
│       ├── components/ui.jsx        # thành phần UI dùng chung
│       └── pages/                   # Auth, Kyc, TestnetTransfer, Dashboard, Admin
└── docs/
    ├── evidence.md                  # test matrix, ảnh, hash Explorer
    ├── evidence-images/
    └── report-outline.md            # đề cương báo cáo
```

## Mô hình dữ liệu

Định nghĩa trong `database/schema.sql`:

| Bảng | Nội dung |
|---|---|
| `users` | email, `password_hash`, `role` (`CUSTOMER`/`ADMIN`), `stellar_public_key` |
| `kyc_submissions` | hồ sơ KYC giả (`full_name`, `country`, `demo_id`), `status`, `rejection_reason`, người duyệt |
| `aml_watchlist` | các `demo_id` bị cảnh báo và lý do |
| `aml_checks` | từng quyết định AML (`PASS`/`FAIL`, `reason`), cờ `is_demo` cho lượt **Thử AML** của admin |
| `transfers` | giao dịch `DIRECT`/`PATH`: tài sản, số tiền gửi/nhận, `dest_min`, `status` (`PENDING`, `CONFIRMED`, `FAILED`, `BLOCKED_KYC`, `BLOCKED_AML`), `tx_hash`, `fee_xlm`, mã lỗi, `request_key` (UUID idempotency), `envelope_xdr` |

## API

Role `Công khai` không cần đăng nhập; các route còn lại cần `Authorization: Bearer <token>`.

| Method | Path | Role | Mục đích |
|---|---|---|---|
| GET | `/api/health` | Công khai | Kiểm tra backend |
| GET | `/api/db/status` | Công khai | `SELECT 1` tới PostgreSQL (503 nếu lỗi) |
| GET | `/api/stellar/status` | Công khai | Số ledger mới nhất từ Horizon Testnet (503 nếu lỗi) |
| POST | `/api/auth/register` | Công khai | Đăng ký customer, trả JWT |
| POST | `/api/auth/login` | Công khai | Đăng nhập, trả JWT |
| GET | `/api/kyc` | CUSTOMER | Xem hồ sơ KYC mới nhất của mình |
| POST | `/api/kyc` | CUSTOMER | Nộp (hoặc nộp lại) hồ sơ KYC giả |
| GET | `/api/wallet` | CUSTOMER | Địa chỉ ví và số dư XLM/VNDDEMO/USDDEMO từ Horizon |
| POST | `/api/wallet` | CUSTOMER (KYC `APPROVED`) | Tạo/dùng lại ví Testnet |
| POST | `/api/wallet/trustlines` | CUSTOMER (KYC `APPROVED`) | Tạo trustline `VNDDEMO` hoặc `USDDEMO` |
| GET | `/api/transfers` | CUSTOMER | 20 giao dịch gần nhất do mình gửi |
| POST | `/api/transfers` | CUSTOMER | Gửi `DIRECT` hoặc `PATH` (header `Idempotency-Key`) |
| GET | `/api/transfers/:id` | CUSTOMER | Tra cứu/cập nhật một giao dịch của mình |
| GET | `/api/admin/kyc` | ADMIN | Hồ sơ KYC mới nhất của từng user |
| POST | `/api/admin/kyc/:id/review` | ADMIN | Duyệt (`APPROVED`) hoặc từ chối (`REJECTED` + lý do) |
| POST | `/api/admin/aml/test` | ADMIN | Thử AML cho một customer, tài sản và số tiền |
| GET | `/api/admin/aml` | ADMIN | 20 lượt AML gần nhất (`?result=FAIL` để lọc bị từ chối) |

Customer gọi API admin nhận HTTP 403; thiếu hoặc sai token nhận HTTP 401.

## Luật AML

Đánh giá trong `backend/src/services/aml.js`, theo thứ tự:

1. **KYC:** hồ sơ mới nhất phải `APPROVED`, nếu không bị chặn (`KYC_REQUIRED`).
2. **Hạn mức (`LIMIT`):** tối đa **1.000.000 VNDDEMO** tương đương mỗi lần; `USDDEMO` quy đổi bằng tỷ giá cố định **25.000 VNDDEMO/USDDEMO** (tương đương 40 USDDEMO).
3. **Watchlist (`WATCHLIST`):** `demo_id` của hồ sơ nằm trong `aml_watchlist` (seed có `DEMO-BLOCK-001`).
4. **Tần suất (`FREQUENCY`):** tối đa **3 lượt/24 giờ**. Giao dịch thật tính theo bản ghi `PENDING` và `CONFIRMED`; lượt **Thử AML** của admin tính riêng theo các lượt `PASS` mô phỏng.

## Tài sản và ví Stellar

- **issuer:** phát hành `VNDDEMO` và `USDDEMO` (cùng một issuer; asset được định danh bằng cặp code + issuer). Giao diện có thể viết `VND-DEMO`, nhưng code on-chain không có dấu gạch nối.
- **distributor:** nhận **5.000.000 VNDDEMO** và **1.000 USDDEMO** từ issuer, cấp tiền demo cho Alice (500.000 VNDDEMO) và cấp 200 USDDEMO cho market maker.
- **marketMaker:** giữ **một offer** `manageSellOffer` bán **100 USDDEMO** lấy VNDDEMO, giá **25.000 VNDDEMO/USDDEMO**, làm thanh khoản cho path payment.
- Ví customer: mỗi người 1 ví, tạo sau khi KYC `APPROVED`.

## Giao diện

Năm màn hình: **Auth** (đăng ký/đăng nhập), **Hồ sơ & KYC** (nộp hồ sơ, xem trạng thái, tạo ví), **Chuyển tiền** (DIRECT/PATH, trustline, tra cứu theo ID), **Dashboard** (ví, số dư, phí mạng, tỷ giá tham chiếu, lịch sử, link Explorer) và **Admin** (duyệt/từ chối KYC, Thử AML, bảng lượt AML bị từ chối). Phía dưới trang có trạng thái kết nối Backend, Database và Stellar.

Giao diện theo design system warm-editorial trong `.agents/skills/references/DESIGN.md`: nền cream, tiêu đề serif, nút CTA màu coral, thẻ nền tối cho dữ liệu on-chain. Dùng CSS thường, không dùng thư viện UI.

## Cài đặt

Cần Node.js 24 và Docker Compose v2. Trên Windows, mở Docker Desktop và đợi Engine chạy. Trên Ubuntu, khởi động Docker Engine nếu cần (`sudo systemctl start docker`).

Chạy từ root project trên cả Windows và Ubuntu.

```sh
npm --prefix backend ci
npm --prefix frontend ci
docker compose up -d db
```

Tạo `backend/.env` từ file mẫu. Giữ cấu hình hiện có nếu bạn đã tạo file.

```powershell
# Windows PowerShell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

```bash
# Ubuntu
test -f backend/.env || cp backend/.env.example backend/.env
```

PostgreSQL dùng cổng `55432` trên host (cổng `5432` trong container). Nếu đổi cổng host trong Compose, cập nhật cùng cổng trong `backend/.env`. Mật khẩu trong file mẫu dành cho DB demo cục bộ.

Nếu `backend/.env` chưa có `JWT_SECRET`, tạo giá trị ngẫu nhiên bằng lệnh sau và điền vào dòng `JWT_SECRET=` trong file. Giữ nguyên giá trị đã cấu hình khi chạy lại.

```sh
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

Khi PostgreSQL đã khởi động, chạy lệnh dưới đây để tạo schema, tài khoản và watchlist demo. Chạy lại sẽ đặt mật khẩu của ba tài khoản seed về `12345678` và giữ nguyên vai trò, hồ sơ và lịch sử của họ.

```sh
npm --prefix backend run seed
```

## Chạy

Mở hai terminal tại root. Chạy một lệnh trong mỗi terminal.

```sh
npm --prefix backend run dev
```

```sh
npm --prefix frontend run dev
```

Mở địa chỉ Vite in ra, mặc định `http://localhost:5173`. Vite chuyển tiếp `/api` tới Express ở `http://127.0.0.1:3000`.

Các script CLI của backend (chạy tại root): `seed`, `stellar:bootstrap`, `stellar:fund-alice`, `stellar:offer` (thêm `-- remove` để xóa offer).

## Kịch bản demo

Từ bản mã nguồn mới:

1. Làm theo phần **Cài đặt** để chạy PostgreSQL, cài dependency từ lockfile, tạo `backend/.env` và chạy seed. Khởi động backend và frontend.
2. Đăng nhập Alice và Bob bằng tài khoản seed, nộp hồ sơ giả. Dùng admin duyệt cả hai. Trong **Hồ sơ & KYC**, bấm **Tạo ví Testnet** cho từng customer.
3. Chạy `npm --prefix backend run stellar:bootstrap` để tạo ví hệ thống và phát hành hai tài sản. Trong **Chuyển tiền**, tạo trustline VNDDEMO cho Alice và cả VNDDEMO/USDDEMO cho Bob.
4. Chạy `npm --prefix backend run stellar:fund-alice`. Alice dùng **DIRECT** gửi `50000` VNDDEMO vào địa chỉ ví Bob.
5. Chạy `npm --prefix backend run stellar:offer`. Alice dùng **PATH** gửi `250000` VNDDEMO, đặt **USDDEMO tối thiểu** là `9.9`.
6. Mở **Dashboard** của Alice để kiểm tra trạng thái, hash và phí. Đăng nhập Bob để xem số dư. Dùng admin thử AML hoặc xem các ca lỗi đã được ghi nhận trong tài liệu nghiệm thu.

### Tài khoản seed

Mật khẩu demo của cả ba tài khoản là `12345678`.

| Email | Vai trò |
|---|---|
| `alice@globalremit.test` | CUSTOMER |
| `bob@globalremit.test` | CUSTOMER |
| `admin@globalremit.test` | ADMIN |

## Kiểm thử

Chạy khi PostgreSQL đang chạy. Test dùng một schema riêng và dọn schema đó sau khi chạy.

```sh
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Hướng dẫn nghiệm thu theo phase

### Phase 1 — Kết nối nền tảng

1. Mở trang và xem trạng thái ở cuối trang. **Backend**, **Database** và **Stellar** phải hiện **Connected**. Dòng Stellar phải có số ledger lấy từ Horizon Testnet.
2. Mở trực tiếp ba URL dưới đây trong trình duyệt và đối chiếu HTTP 200 cùng JSON trả về.

| URL | Kết quả khi kết nối được |
|---|---|
| `http://127.0.0.1:3000/api/health` | `{"status":"ok"}` |
| `http://127.0.0.1:3000/api/db/status` | `{"status":"ok"}` sau khi chạy `SELECT 1` |
| `http://127.0.0.1:3000/api/stellar/status` | `status: "ok"` và `ledger` là số nguyên dương |

3. Chạy `docker compose stop db`, rồi tải lại trang. Database phải hiện **Unavailable** (API trả HTTP 503), còn Backend và Stellar vẫn kiểm tra độc lập. Chạy lại `docker compose up -d db`, chờ PostgreSQL sẵn sàng và tải lại trang để xác nhận cả ba kết nối phục hồi.
4. Dừng Express và Vite bằng Ctrl+C, chạy lại hai lệnh rồi tải lại trang. Nghiệm thu khi trang mở được và cả ba kết nối vẫn hoạt động.

### Phase 2 — Đăng nhập, KYC, AML

JWT có hiệu lực 2 giờ. Tải lại trang trong cùng tab vẫn giữ phiên đăng nhập còn hạn. Hồ sơ và lịch sử kiểm tra nằm trong PostgreSQL. Dùng tài khoản seed ở bảng trên.

1. Đăng ký bằng một địa chỉ email giả mới hoặc đăng nhập Alice. Nhập tên `Alice Demo`, mã quốc gia `VN`, mã hồ sơ `DEMO-ALICE`. Hồ sơ phải hiện `PENDING`.
2. Đăng nhập admin. Mở **Thử AML** cho Alice với `VNDDEMO` và số tiền `1`. Hồ sơ chưa duyệt phải bị chặn. Từ chối hồ sơ với lý do, kiểm tra Alice thấy `REJECTED` và lý do khi tải trạng thái. Thử AML lại để thấy hồ sơ bị từ chối vẫn bị chặn.
3. Nộp lại hồ sơ Alice rồi dùng admin bấm **Duyệt**. Kiểm tra Alice thấy `APPROVED`.
4. Trong **Thử AML**, dùng Alice và nhập `1000000.0000001 VNDDEMO` hoặc `40.0000001 USDDEMO` để thấy **Vượt hạn mức**. Dùng số tiền dạng thập phân với dấu chấm.
5. Với một customer đã duyệt chưa có lượt `PASS` trong 24 giờ, thử `1 VNDDEMO` bốn lần. Ba lượt đầu `PASS`, lượt thứ tư báo **Đã đủ 3 lượt trong 24 giờ**. Chỉ lượt `PASS` của mô phỏng chiếm hạn mức tần suất Phase 2.
6. Nộp KYC của Bob với mã `DEMO-BLOCK-001` và duyệt hồ sơ. Kiểm tra AML với `1 VNDDEMO` để thấy **Mã hồ sơ thuộc watchlist**. Lịch sử của admin hiển thị các lượt `PASS` và `FAIL`.

Nghiệm thu khi đăng ký/đăng nhập và duyệt/từ chối hoạt động, customer bị API admin trả HTTP 403, hồ sơ chưa duyệt bị chặn, và từng luật AML cho kết quả đúng. Chạy `npm --prefix backend test` khi PostgreSQL đang chạy để kiểm tra tự động.

### Phase 3 — Ví Stellar và hai tài sản

1. Chạy PostgreSQL và cấu hình backend như trên. Tại root project, chạy:

   ```sh
   npm --prefix backend run stellar:bootstrap
   ```

   Lệnh tạo hoặc dùng lại `issuer`, `distributor` và `marketMaker`. Friendbot cấp XLM thử nghiệm, và lệnh dùng Horizon để xác nhận ví tồn tại. Đầu ra chỉ gồm public key, link Explorer, kết quả giao dịch và số dư.

2. Mở hai link giao dịch từ CLI. Giao dịch `changeTrust` do **distributor** ký để tạo trustline cho `VNDDEMO` và `USDDEMO`. Giao dịch `payment` do **issuer** ký, gửi **5.000.000 VNDDEMO** và **1.000 USDDEMO** vào distributor. `marketMaker` có XLM Testnet từ Friendbot ở Phase này.
3. Chạy lại lệnh bootstrap. Hai hash phải giữ nguyên. Nếu Horizon chưa xác nhận, lệnh lưu giao dịch đã ký với trạng thái `PENDING` và lần chạy lại tra cứu hoặc gửi lại đúng giao dịch đó. Nếu giao dịch hết hạn và Horizon vẫn chưa xác định được kết quả, bootstrap dừng để tránh phát hành trùng.
4. Đăng nhập customer đã `APPROVED`, vào **Hồ sơ & KYC → Tạo ví Testnet**. Mở public key được hiển thị để xem ví trên Explorer. Bấm **Kiểm tra lại ví Testnet** phải trả cùng địa chỉ. Customer chưa được duyệt sẽ bị API trả HTTP 403.
5. Trong pgAdmin hoặc psql, chạy `SELECT email, stellar_public_key FROM users ORDER BY id;` để đối chiếu public key của Alice/Bob. Kết quả và link giao dịch của lần chạy Phase 3 nằm trong `PROJECT_PROGRESS.md`.

Secret key được lưu local trong `backend/.secrets/stellar-wallets.json`. Thư mục `.secrets/` đã được Git bỏ qua. Giữ kho này cùng cấu hình PostgreSQL khi chạy lại.

### Phase 4 — Trustline và chuyển DIRECT

Đăng nhập Alice và mở **Chuyển tiền**. Chọn **DIRECT** khi muốn gửi VNDDEMO. Trên bộ dữ liệu đã nghiệm thu, nhập ID `4` và bấm **Tra cứu** để xem giao dịch 50.000 VNDDEMO đã chuyển cho Bob, phí XLM và link Explorer. Đăng nhập Bob và mở **Dashboard** để xem số dư. Nếu yêu cầu gửi chưa có kết quả, bấm **Kiểm tra yêu cầu gửi** để dùng lại cùng mã yêu cầu.

Để chạy lại qua API, chạy `npm --prefix backend run seed` để cập nhật schema PostgreSQL hiện có. Khởi động backend, rồi xác nhận Alice và Bob đã có ví Stellar Testnet và KYC `APPROVED`.

#### Tạo trustline và cấp tiền demo

Chạy các lệnh sau trong PowerShell tại root project.

```powershell
$api = 'http://127.0.0.1:3000/api'
function Get-DemoHeaders($email) {
  $login = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' -Body (@{
    email = $email
    password = '12345678'
  } | ConvertTo-Json)
  @{ Authorization = "Bearer $($login.token)" }
}
$alice = Get-DemoHeaders 'alice@globalremit.test'
$bob = Get-DemoHeaders 'bob@globalremit.test'

Invoke-RestMethod "$api/wallet/trustlines" -Method Post -Headers $alice -ContentType 'application/json' -Body '{"assetCode":"VNDDEMO"}'
Invoke-RestMethod "$api/wallet/trustlines" -Method Post -Headers $bob -ContentType 'application/json' -Body '{"assetCode":"VNDDEMO"}'
Invoke-RestMethod "$api/wallet/trustlines" -Method Post -Headers $bob -ContentType 'application/json' -Body '{"assetCode":"USDDEMO"}'
npm --prefix backend run stellar:fund-alice
```

Customer ký `changeTrust` cho chính ví của mình qua backend. Distributor ký `payment` cấp **500.000 VNDDEMO** cho Alice. Chạy lại trustline và lệnh cấp tiền phải trả hash đã lưu, không cấp thêm.

#### Gửi DIRECT và xem kết quả

```powershell
$bobWallet = Invoke-RestMethod "$api/wallet" -Headers $bob
$alice['Idempotency-Key'] = '407d1515-f59a-4fcb-8fe0-b57feb0ade4e'
$body = @{
  type = 'DIRECT'
  assetCode = 'VNDDEMO'
  amount = '50000'
  destination = $bobWallet.publicKey
} | ConvertTo-Json
$result = Invoke-RestMethod "$api/transfers" -Method Post -Headers $alice -ContentType 'application/json' -Body $body
$result.transfer
(Invoke-RestMethod "$api/transfers/$($result.transfer.id)" -Headers $alice).transfer
(Invoke-RestMethod "$api/wallet" -Headers $alice).balances
(Invoke-RestMethod "$api/wallet" -Headers $bob).balances
```

Với bộ dữ liệu demo mới, Alice ký giao dịch gửi **50.000 VNDDEMO** cho Bob. Nghiệm thu khi trạng thái là `CONFIRMED`, link Explorer khớp số tiền, địa chỉ và tài sản, Alice còn **450.000 VNDDEMO** và Bob có **50.000 VNDDEMO**. Phí lấy từ Stellar và trả bằng XLM. UUID trong ví dụ cũng là UUID dùng khi nghiệm thu, nên trên cùng dữ liệu demo, chạy lại trả giao dịch đã có.

- Nếu thấy `PENDING`, gọi lại `GET /api/transfers/:id` hoặc gửi lại cùng `Idempotency-Key` để tra cứu. Giữ nguyên UUID trong lúc chưa rõ kết quả. Chỉ tạo UUID mới khi muốn gửi một yêu cầu mới.
- Thiếu trustline hoặc số dư trả HTTP 409 với `NO_TRUSTLINE` hoặc `NO_BALANCE`. Lỗi đọc Horizon trước submit trả HTTP 503. Giao dịch bị chặn KYC/AML trả HTTP 403 và `txHash: null`.
- Tần suất chuyển thật tính theo các bản ghi `PENDING` và `CONFIRMED` trong 24 giờ. Lượt **Thử AML** của admin vẫn tính riêng. Chạy `npm --prefix backend test` để kiểm tra quyền, ba luật và tình huống Horizon tạm lỗi.

### Phase 5 — Path payment VNDDEMO → USDDEMO

#### Chuẩn bị market maker

Tại root project, cập nhật schema và đặt offer trên Stellar Testnet:

```sh
npm --prefix backend run seed
npm --prefix backend run stellar:offer
```

Lần đầu, market maker ký trustlines của hai tài sản rồi Distributor cấp **200 USDDEMO** một lần. Market maker ký `manageSellOffer` bán **100 USDDEMO**, mua VNDDEMO, giá **25.000 VNDDEMO/USDDEMO**. Phần USDDEMO còn lại dùng để khôi phục offer nếu demo đã khớp một phần. Chạy lại khi offer còn mở trả lại hash của offer đang dùng và số lượng còn lại trên Horizon.

#### Gửi PATH và kiểm tra hai ca lỗi

1. Bob cần trustline USDDEMO. Người gửi cần KYC `APPROVED`, đủ VNDDEMO/XLM và còn hạn mức AML. Đăng nhập ở [localhost:5173](http://localhost:5173/), mở **Chuyển tiền**, chọn **PATH**, dán public key của Bob và điền `250000` VNDDEMO cùng mức tối thiểu `9.9` USDDEMO. API tương ứng là `POST /api/transfers` với body `{"type":"PATH","assetCode":"VNDDEMO","amount":"250000","destination":"<public key Bob>","destMin":"9.9"}`.
2. Để kiểm tra thiếu thanh khoản, chạy `npm --prefix backend run stellar:offer -- remove`, rồi gửi PATH. Kết quả phải là `FAILED / NO_LIQUIDITY`. Chạy lại `npm --prefix backend run stellar:offer` để khôi phục đúng một offer.
3. Khi offer đang mở, thử `destMin: "10.1"` với số tiền gửi `250000`. Kết quả phải là `FAILED / DEST_MIN`. Dùng yêu cầu mới với `destMin: "9.9"` để kiểm tra ca thành công. Giao dịch thất bại đã được Stellar ghi vào ledger có thể có hash và phí XLM. Số dư VNDDEMO/USDDEMO giữ nguyên trong hai ca lỗi.
4. Ca thành công phải hiện `CONFIRMED`, số USDDEMO thực nhận, phí XLM và link Explorer. Nếu thấy `PENDING`, dùng nút **Kiểm tra yêu cầu gửi** hoặc gọi `GET /api/transfers/:id`. Mở tài khoản Bob để đối chiếu số dư USDDEMO từ Horizon.

Chạy các ca lỗi trước giao dịch thành công để giữ đủ VNDDEMO cho cùng kịch bản. Luồng DIRECT và PATH dùng chung giới hạn AML theo tài khoản. Kết quả và ID để tra cứu của lần kiểm tra Phase 5 nằm trong `PROJECT_PROGRESS.md`.

Với dữ liệu đã nghiệm thu, đăng nhập `alice-path@globalremit.test` bằng mật khẩu demo `12345678` và mở **Dashboard** hoặc **Tra cứu** ID `12` để xem giao dịch đã gửi 10 USDDEMO cho Bob. ID `10` là ca thiếu thanh khoản và ID `11` là ca không đạt mức tối thiểu. Tài khoản Alice thường đã đủ ba lượt trong cửa sổ AML lúc kiểm tra, nên dùng một ví demo riêng cho ca thành công.

### Phase 6 — Giao diện tổng hợp

Mở [localhost:5173](http://localhost:5173/) sau khi chạy PostgreSQL, backend và frontend. Các màn hình trong phạm vi demo gồm **Auth**, **Hồ sơ & KYC**, **Chuyển tiền**, **Dashboard** và **Admin**.

1. Đăng ký customer bằng email giả mới. Trong **Hồ sơ & KYC**, nộp hồ sơ giả. Dùng tài khoản admin duyệt, sau đó đăng nhập lại customer hoặc bấm **Tải trạng thái**. Bấm **Tạo ví Testnet** khi hồ sơ là `APPROVED`.
2. Trong **Chuyển tiền**, dùng DIRECT hoặc PATH với ví đã có tài sản và trustline cần thiết. Nút gửi bị khóa trong lúc xử lý. Nếu giao dịch đang `PENDING`, dùng **Kiểm tra yêu cầu gửi** hoặc **Dashboard → Tải lại** để xem trạng thái mới.
3. **Dashboard** cho xem địa chỉ ví, số dư từ Horizon và 20 giao dịch gần nhất do chính tài khoản này gửi. Khi có hash, bấm vào hash để mở Stellar Explorer Testnet. Cột **Phí mạng** lấy phí thực tế bằng XLM. Mức **25.000 VNDDEMO/USDDEMO** là tỷ giá tham chiếu cố định.
4. Nhấn **Ctrl+R** trong cùng tab. Phiên còn hạn và dữ liệu Dashboard được tải lại. Đăng nhập một customer khác để kiểm tra lịch sử của người gửi không xuất hiện ở tài khoản đó.
5. Đăng nhập admin để duyệt hoặc từ chối KYC, thử AML và xem bảng các lượt AML bị từ chối.

Trên dữ liệu đã nghiệm thu, đăng nhập `phase6@globalremit.test` / `12345678` rồi mở **Dashboard** để xem DIRECT `#13` và PATH `#14`. Bob hiện có **11 USDDEMO** sau lượt gửi thử Phase 6. Các địa chỉ ví và hash kiểm chứng nằm trong `PROJECT_PROGRESS.md`.

## Khôi phục bộ dữ liệu khi Stellar Testnet reset

Nếu Testnet reset, các hash cũ có thể biến mất. Xác nhận reset trước khi chuẩn bị một bộ dữ liệu demo mới, và giữ bản sao kho khóa cũ ở vị trí riêng tư.

Giữ bản sao cũ và ảnh minh chứng. Chuẩn bị một bản mã nguồn sạch, tạo một database demo mới trên PostgreSQL và trỏ `DATABASE_URL` trong `backend/.env` của bản mới vào database đó. Nếu tiếp tục dùng container PostgreSQL hiện tại, chạy lệnh sau từ thư mục đã dùng để khởi động container, với tên database chưa tồn tại:

```sh
docker compose exec db psql -U globalremit -d postgres -c "CREATE DATABASE globalremit_demo_reset"
```

Bản mới bắt đầu với kho `backend/.secrets/` trống. Dừng backend và frontend của bản cũ trước khi khởi động bản mới trên cùng cổng. Chạy lại seed và kịch bản demo theo thứ tự trên để Friendbot cấp ví mới, phát hành hai tài sản và tạo lại offer. Bộ database và kho khóa cũ vẫn được lưu riêng. Không dùng lại hash cũ làm kết quả của lần demo mới.

## Giới hạn và hướng phát triển

- **Khóa custodial:** secret key Testnet lưu trong file JSON `backend/.secrets/stellar-wallets.json`, backend ký thay người dùng. Cách này không an toàn cho production (cần KMS/HSM hoặc ví do người dùng giữ khóa).
- **Tỷ giá cố định** 1 USDDEMO = 25.000 VNDDEMO, không phải tỷ giá thị trường hay cam kết số tiền nhận.
- **Chỉ một offer** của market maker, không có hệ thống khớp lệnh hay quản lý thanh khoản riêng.
- **Không realtime:** dữ liệu cập nhật bằng tải lại trang hoặc nút tải lại.
- KYC chỉ là form giả, AML chỉ có 3 luật đơn giản, chỉ hai tài sản demo.
- Hướng phát triển: tỷ giá/thanh khoản động, nhiều offer, cập nhật realtime, lưu khóa an toàn, KYC/AML thật.

## Tài liệu nộp bài

- [Test matrix T01–T13, bảng YC01–YC08, ảnh và hash Explorer](docs/evidence.md)
- [Đề cương báo cáo tiếng Việt theo Chapter 5 và 9](docs/report-outline.md)
- [Tiến độ và kết quả theo phase](PROJECT_PROGRESS.md)
