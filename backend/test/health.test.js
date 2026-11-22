import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

// Dùng cổng không có PostgreSQL để kiểm tra trường hợp DB mất kết nối.
process.env.DATABASE_URL = "postgresql://globalremit@127.0.0.1:1/globalremit";
const { app } = await import("../src/server.js");

test("Backend vẫn báo OK khi PostgreSQL mất kết nối", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const database = await fetch(`${baseUrl}/api/db/status`);
  strictEqual(database.status, 503);
  deepStrictEqual(await database.json(), { status: "error" });

  const backend = await fetch(`${baseUrl}/api/health`);
  strictEqual(backend.status, 200);
  deepStrictEqual(await backend.json(), { status: "ok" });
});
