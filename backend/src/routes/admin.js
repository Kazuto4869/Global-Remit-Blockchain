import { Router } from "express";
import { pool } from "../db.js";
import { checkAml } from "../services/aml.js";
import { textField } from "./kyc.js";

export const adminRoutes = Router();

adminRoutes.get("/kyc", async (_req, res) => {
  const { rows: submissions } = await pool.query(
    `SELECT k.id, u.email, k.full_name, k.country, k.demo_id, k.status, k.rejection_reason
     FROM kyc_submissions k JOIN users u ON u.id = k.user_id
     WHERE k.id = (SELECT max(id) FROM kyc_submissions WHERE user_id = k.user_id)
     ORDER BY k.id DESC`,
  );
  res.json({ submissions });
});

adminRoutes.post("/kyc/:id/review", async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  const reason = textField(req.body?.rejection_reason, 200);
  if (!/^[0-9]+$/.test(req.params.id) || !(id > 0 && id <= 2_147_483_647) ||
      (status !== "APPROVED" && status !== "REJECTED") || (status === "REJECTED" && !reason)) {
    return res.status(400).json({ error: "Quyết định không hợp lệ. Khi từ chối cần nhập lý do." });
  }
  const { rows: [submission] } = await pool.query(
    `UPDATE kyc_submissions k SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = now()
     WHERE k.id = $1 AND k.status = 'PENDING'
       AND NOT EXISTS (SELECT 1 FROM kyc_submissions WHERE user_id = k.user_id AND id > k.id)
     RETURNING id, status, rejection_reason`,
    [id, status, status === "REJECTED" ? reason : null, req.user.id],
  );
  if (!submission) return res.status(409).json({ error: "Hồ sơ không còn chờ duyệt hoặc đã được nộp lại." });
  res.json({ submission });
});

adminRoutes.post("/aml/test", async (req, res) => {
  const email = textField(req.body?.email, 254).toLowerCase();
  if (!email) return res.status(400).json({ error: "Nhập email của customer demo." });
  const { rows: [customer] } = await pool.query(
    "SELECT id FROM users WHERE email = $1 AND role = 'CUSTOMER'",
    [email],
  );
  if (!customer) return res.status(404).json({ error: "Không tìm thấy customer demo." });
  const decision = await checkAml(customer, req.body?.assetCode, req.body?.amount);
  if (!decision) return res.status(400).json({ error: "Chọn tài sản demo và nhập số tiền dương với tối đa 7 số lẻ." });
  res.status(decision.reason === "KYC_REQUIRED" ? 403 : 200).json(decision);
});

adminRoutes.get("/aml", async (req, res) => {
  const { rows: checks } = await pool.query(
    `SELECT a.id, u.email, a.asset_code, a.amount, a.result, a.reason
     FROM aml_checks a JOIN users u ON u.id = a.user_id
     WHERE ($1::text IS NULL OR a.result = $1) ORDER BY a.id DESC LIMIT 20`,
    [req.query.result === "FAIL" ? "FAIL" : null],
  );
  res.json({ checks });
});
