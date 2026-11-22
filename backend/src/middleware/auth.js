import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export async function requireAuth(req, res, next) {
  const token = req.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  let userId;
  try {
    userId = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] }).sub;
  } catch {
    return res.status(401).json({ error: "Bạn cần đăng nhập." });
  }

  // JWT xác định người dùng, PostgreSQL cung cấp quyền hiện tại.
  const { rows: [user] } = await pool.query(
    "SELECT id, email, role, stellar_public_key FROM users WHERE id = $1",
    [userId],
  );
  if (!user) return res.status(401).json({ error: "Bạn cần đăng nhập." });
  req.user = user;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: "Bạn không có quyền thực hiện." });
    next();
  };
}

export const requireAdmin = requireRole("ADMIN");
export const requireCustomer = requireRole("CUSTOMER");
