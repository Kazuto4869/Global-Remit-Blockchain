import express from "express";
import { pool } from "./db.js";
import { checkStellarConnection, StellarDemoError } from "./services/stellarService.js";
import { requireAdmin, requireAuth, requireCustomer } from "./middleware/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { kycRoutes } from "./routes/kyc.js";
import { walletRoutes } from "./routes/wallet.js";
import { transferRoutes } from "./routes/transfers.js";

export const app = express();

// Tách endpoint để một dịch vụ lỗi không làm sai trạng thái dịch vụ khác.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db/status", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.get("/api/stellar/status", async (_req, res) => {
  try {
    const ledger = await checkStellarConnection();
    res.json({ status: "ok", ledger });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use(express.json({ limit: "8kb" }));
app.use("/api/auth", authRoutes);
app.use("/api/kyc", requireAuth, requireCustomer, kycRoutes);
app.use("/api/wallet", requireAuth, requireCustomer, walletRoutes);
app.use("/api/transfers", requireAuth, requireCustomer, transferRoutes);
app.use("/api/admin", requireAuth, requireAdmin, adminRoutes);

app.use((error, _req, res, _next) => {
  if (error instanceof StellarDemoError) return res.status(error.status).json({ error: error.message });
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "JSON không hợp lệ." });
  if (error.type === "entity.too.large") return res.status(413).json({ error: "Yêu cầu quá lớn." });
  console.error("Lỗi khi xử lý yêu cầu API.");
  res.status(500).json({ error: "Backend gặp lỗi khi xử lý yêu cầu." });
});

if (import.meta.main) {
  if ((process.env.JWT_SECRET ?? "").length < 32) {
    throw new Error("Đặt JWT_SECRET (ít nhất 32 ký tự) trong backend/.env trước khi chạy.");
  }
  app.listen(3000, "127.0.0.1", () => {
    console.log("GlobalRemit API: http://127.0.0.1:3000");
  });
}
