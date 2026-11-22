import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const schema = await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8");
const accounts = [
  ["admin@globalremit.test", "ADMIN"],
  ["alice@globalremit.test", "CUSTOMER"],
  ["bob@globalremit.test", "CUSTOMER"],
];

try {
  const hash = await bcrypt.hash("12345678", 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    for (const [email, role] of accounts) {
      // Chỉ cập nhật mật khẩu cho ba tài khoản demo có đúng vai trò.
      const { rowCount } = await client.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
         WHERE users.role = EXCLUDED.role`,
        [email, hash, role],
      );
      if (rowCount === 0) throw new Error(`Vai trò hiện có xung đột với tài khoản demo ${email}.`);
    }
    await client.query(
      "INSERT INTO aml_watchlist (demo_id, reason) VALUES ($1, $2) ON CONFLICT (demo_id) DO NOTHING",
      ["DEMO-BLOCK-001", "Mã hồ sơ dùng để thử luật watchlist"],
    );
    await client.query("COMMIT");
    console.log("Đã chuẩn bị schema, tài khoản và watchlist demo.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
