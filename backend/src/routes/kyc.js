import { Router } from "express";
import { pool } from "../db.js";
import { accountExplorerUrl } from "../services/stellarService.js";

export const kycRoutes = Router();

export function textField(value, maxLength) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length <= maxLength && !text.includes("\0") ? text : "";
}

kycRoutes.get("/", async (req, res) => {
  const { rows: [submission] } = await pool.query(
    `SELECT id, full_name, country, demo_id, status, rejection_reason
     FROM kyc_submissions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [req.user.id],
  );
  const publicKey = req.user.stellar_public_key;
  const wallet = publicKey ? { publicKey, explorerUrl: accountExplorerUrl(publicKey) } : null;
  res.json({ submission: submission ?? null, wallet });
});

kycRoutes.post("/", async (req, res) => {
  const fullName = textField(req.body?.full_name, 100);
  const country = textField(req.body?.country, 2).toUpperCase();
  const demoId = textField(req.body?.demo_id, 40).toUpperCase();
  if (!fullName || !/^[A-Z]{2}$/.test(country) || !/^DEMO-[A-Z0-9-]+$/.test(demoId)) {
    return res.status(400).json({ error: "Nhập tên giả, mã quốc gia hai chữ cái và mã bắt đầu bằng DEMO-." });
  }
  const { rows: [submission] } = await pool.query(
    `INSERT INTO kyc_submissions (user_id, full_name, country, demo_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, country, demo_id, status, rejection_reason`,
    [req.user.id, fullName, country, demoId],
  );
  res.status(201).json({ submission });
});
