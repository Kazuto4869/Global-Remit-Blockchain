import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export const authRoutes = Router();

function credentials(body) {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body?.password;
  if (email.length > 254 || !/^[^\s@\x00]+@[^\s@\x00]+\.[^\s@\x00]+$/.test(email)) return null;
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) return null;
  return { email, password };
}

function session(user) {
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    algorithm: "HS256",
    subject: String(user.id),
    expiresIn: "2h",
  });
  return { token, user };
}

authRoutes.post("/register", async (req, res) => {
  const input = credentials(req.body);
  if (!input) return res.status(400).json({ error: "Email hoặc mật khẩu không hợp lệ." });
  const hash = await bcrypt.hash(input.password, 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'CUSTOMER')
     ON CONFLICT (email) DO NOTHING RETURNING id, email, role`,
    [input.email, hash],
  );
  if (!user) return res.status(409).json({ error: "Email đã được đăng ký." });
  res.status(201).json(session(user));
});

authRoutes.post("/login", async (req, res) => {
  const input = credentials(req.body);
  if (input) {
    const { rows: [record] } = await pool.query(
      "SELECT id, email, role, password_hash FROM users WHERE email = $1",
      [input.email],
    );
    if (record && await bcrypt.compare(input.password, record.password_hash)) {
      const { id, email, role } = record;
      return res.json(session({ id, email, role }));
    }
  }
  res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
});
