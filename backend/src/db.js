import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
});

// Kết nối SQL đang rảnh cũng có thể mất khi PostgreSQL khởi động lại.
pool.on("error", () => console.error("PostgreSQL: kết nối rảnh bị ngắt."));
