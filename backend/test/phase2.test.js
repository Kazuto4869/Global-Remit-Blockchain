import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { Account, Asset, Keypair, NotFoundError, Operation } from "@stellar/stellar-sdk";

const schema = `phase2_${randomBytes(8).toString("hex")}`;
const password = "12345678";
let db, pool, server, base;

before(async () => {
  assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to the local PostgreSQL database");
  const url = new URL(process.env.DATABASE_URL);
  db = new pg.Pool({ connectionString: url.href });
  await db.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.href;
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  ({ pool } = await import("../src/db.js"));
  await pool.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
  const hash = await bcrypt.hash(password, 4);
  await pool.query("INSERT INTO users (email, password_hash, role) VALUES ('admin@example.test', $1, 'ADMIN')", [hash]);
  await pool.query("INSERT INTO aml_watchlist (demo_id, reason) VALUES ('DEMO-BLOCK-001', 'Kiểm thử')");
  const { app } = await import("../src/server.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool?.end();
  if (db) {
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  }
});

async function request(path, status, body, token) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(response.status, status, path);
  return response.json();
}

test("Register/login, hồ sơ riêng, quyền admin và các nhánh KYC/AML", async () => {
  const alice = "alice@example.test";
  const bob = "bob@example.test";
  const admin = (await request("/auth/login", 200, { email: "admin@example.test", password })).token;
  const account = await request("/auth/register", 201, { email: alice, password, role: "ADMIN" });
  assert.equal(account.user.role, "CUSTOMER");
  assert.equal(account.user.password_hash, undefined);
  const stored = (await pool.query("SELECT password_hash FROM users WHERE email = $1", [alice])).rows[0];
  assert.notEqual(stored.password_hash, password);
  assert.equal(await bcrypt.compare(password, stored.password_hash), true);
  await request("/auth/register", 409, { email: alice.toUpperCase(), password });
  await request("/auth/login", 401, { email: alice, password: "incorrect" });
  const customer = (await request("/auth/login", 200, { email: alice, password })).token;
  const other = (await request("/auth/register", 201, { email: bob, password })).token;
  await request("/admin/kyc", 401);
  await request("/admin/kyc", 401, undefined, "invalid");
  const forgedAdmin = jwt.sign({ role: "ADMIN" }, randomBytes(32).toString("hex"), {
    algorithm: "HS256", subject: String(account.user.id), expiresIn: "5m",
  });
  await request("/admin/kyc", 401, undefined, forgedAdmin);
  await request("/admin/kyc", 403, undefined, customer);
  await request("/admin/aml/test", 403, { email: alice, assetCode: "VNDDEMO", amount: "1" }, customer);
  await request("/wallet", 401, {});
  await request("/wallet", 403, {}, admin);
  await request("/wallet", 403, {}, other);
  const direct = { type: "DIRECT", assetCode: "VNDDEMO", amount: "1", destination: Keypair.random().publicKey() };
  await request("/transfers", 401);
  await request("/transfers", 403, undefined, admin);
  await request("/transfers", 401, direct);
  await request("/wallet/trustlines", 403, { assetCode: "VNDDEMO" }, other);
  const kycBlock = await request("/transfers", 403, direct, other);
  assert.equal(kycBlock.transfer.status, "BLOCKED_KYC");
  assert.equal(kycBlock.transfer.txHash, null);
  const path = { ...direct, type: "PATH", destMin: "9.9" };
  await request("/transfers", 401, path);
  const pathKyc = await request("/transfers", 403, path, other);
  assert.equal(pathKyc.transfer.status, "BLOCKED_KYC");
  assert.equal(pathKyc.transfer.destAsset, "USDDEMO");
  assert.equal((await request("/kyc", 200, undefined, other)).submission, null);

  const aml = (email, assetCode, amount, status = 200) =>
    request("/admin/aml/test", status, { email, assetCode, amount }, admin);
  assert.equal((await aml(alice, "VNDDEMO", "1", 403)).reason, "KYC_REQUIRED");
  const profile = { full_name: "Alice Demo", country: "VN", demo_id: "DEMO-ALICE" };
  const { submission } = await request("/kyc", 201, { ...profile, userId: 1, status: "APPROVED" }, customer);
  assert.equal(submission.status, "PENDING");
  await request("/wallet", 403, { userId: 1, status: "APPROVED" }, customer);
  assert.equal((await request("/kyc", 200, undefined, customer)).submission.id, submission.id);
  assert.equal((await request("/kyc", 200, undefined, other)).submission, null);
  assert.equal((await aml(alice, "VNDDEMO", "1", 403)).reason, "KYC_REQUIRED");
  await request(`/admin/kyc/${submission.id}/review`, 403, { status: "APPROVED" }, customer);
  await request(`/admin/kyc/${submission.id}/review`, 400, { status: "REJECTED" }, admin);
  await request(`/admin/kyc/${submission.id}/review`, 200, { status: "REJECTED", rejection_reason: "Hồ sơ demo thiếu dữ liệu" }, admin);
  assert.equal((await request("/kyc", 200, undefined, customer)).submission.status, "REJECTED");
  await request("/wallet", 403, {}, customer);
  assert.equal((await aml(alice, "VNDDEMO", "1", 403)).reason, "KYC_REQUIRED");

  const next = (await request("/kyc", 201, profile, customer)).submission;
  const pending = (await request("/kyc", 201, profile, customer)).submission;
  assert.ok((await request("/admin/kyc", 200, undefined, admin)).submissions.some((item) => item.id === pending.id));
  await request(`/admin/kyc/${next.id}/review`, 409, { status: "APPROVED" }, admin);
  await request(`/admin/kyc/${pending.id}/review`, 200, { status: "APPROVED" }, admin);
  await request(`/admin/kyc/${pending.id}/review`, 409, { status: "APPROVED" }, admin);
  await request("/transfers", 400, { ...direct, amount: 1 }, customer);
  await request("/transfers", 400, { ...direct, type: "PATH" }, customer);
  await request("/transfers", 400, { ...path, destMin: 9.9 }, customer);
  const pathAml = await request("/transfers", 403, { ...path, amount: "1000001" }, customer);
  assert.equal(pathAml.transfer.status, "BLOCKED_AML");
  assert.equal(pathAml.transfer.txHash, null);
  const limitBlock = await request("/transfers", 403, { ...direct, amount: "1000000.0000001" }, customer);
  assert.equal(limitBlock.transfer.status, "BLOCKED_AML");
  assert.equal(limitBlock.transfer.txHash, null);
  await request(`/transfers/${limitBlock.transfer.id}`, 404, undefined, other);
  assert.equal((await aml(alice, "VNDDEMO", "1.00000001", 400)).result, undefined);
  assert.equal((await aml(alice, "VNDDEMO", 1, 400)).result, undefined);
  assert.equal((await aml(alice, "VNDDEMO", "1000000.0000001")).reason, "LIMIT");
  assert.equal((await aml(alice, "USDDEMO", "40.0000001")).reason, "LIMIT");
  assert.equal((await aml(alice, "USDDEMO", "40")).result, "PASS");
  assert.equal((await aml(alice, "VNDDEMO", "1000000")).result, "PASS");
  const concurrent = await Promise.all([aml(alice, "VNDDEMO", "1"), aml(alice, "VNDDEMO", "1")]);
  assert.deepEqual(concurrent.map((item) => item.reason).sort(), ["FREQUENCY", null]);
  const afterDemoPasses = await request("/transfers", 409, direct, customer);
  assert.equal(afterDemoPasses.transfer.errorCode, "NO_WALLET");
  await pool.query("UPDATE aml_checks SET created_at = now() - interval '25 hours' WHERE result = 'PASS'");
  assert.equal((await aml(alice, "VNDDEMO", "1")).result, "PASS");

  const blocked = (await request("/kyc", 201, { ...profile, demo_id: "DEMO-BLOCK-001" }, other)).submission;
  await request(`/admin/kyc/${blocked.id}/review`, 200, { status: "APPROVED" }, admin);
  assert.equal((await aml(bob, "VNDDEMO", "1")).reason, "WATCHLIST");
  const watchlistBlock = await request("/transfers", 403, direct, other);
  assert.equal(watchlistBlock.transfer.status, "BLOCKED_AML");
  assert.equal(watchlistBlock.transfer.txHash, null);
  const pathWatchlist = await request("/transfers", 403, path, other);
  assert.equal(pathWatchlist.transfer.errorCode, "WATCHLIST");
  assert.equal(pathWatchlist.transfer.txHash, null);
  const recent = await pool.query("SELECT id FROM users WHERE email = $1", [alice]);
  await pool.query(
    `INSERT INTO transfers (sender_user_id, recipient_public_key, type, send_asset, send_amount, dest_asset, status)
     SELECT $1, $2, 'DIRECT', 'VNDDEMO', 1, 'VNDDEMO', state
     FROM (VALUES ('FAILED'), ('CONFIRMED'), ('CONFIRMED')) AS fixture(state)`,
    [recent.rows[0].id, direct.destination],
  );
  const stillAllowed = await request("/transfers", 409, direct, customer);
  assert.equal(stillAllowed.transfer.errorCode, "NO_WALLET");
  await pool.query(
    `INSERT INTO transfers (sender_user_id, recipient_public_key, type, send_asset, send_amount, dest_asset, status)
     VALUES ($1, $2, 'DIRECT', 'VNDDEMO', 1, 'VNDDEMO', 'PENDING')`,
    [recent.rows[0].id, direct.destination],
  );
  const frequencyBlock = await request("/transfers", 403, direct, customer);
  assert.equal(frequencyBlock.transfer.status, "BLOCKED_AML");
  assert.equal(frequencyBlock.transfer.errorCode, "FREQUENCY");
  const pathFrequency = await request("/transfers", 403, path, customer);
  assert.equal(pathFrequency.transfer.errorCode, "FREQUENCY");
  const { checks } = await request("/admin/aml", 200, undefined, admin);
  assert.ok(checks.some((item) => item.email === alice && item.result === "PASS"));
  assert.ok(checks.some((item) => item.email === bob && item.reason === "WATCHLIST"));
  const rejects = (await request("/admin/aml?result=FAIL", 200, undefined, admin)).checks;
  assert.ok(rejects.length > 0 && rejects.every((item) => item.result === "FAIL"));
  const history = (await request("/transfers", 200, undefined, customer)).transfers;
  assert.ok(history.some((item) => item.id === limitBlock.transfer.id));
  assert.ok(!history.some((item) => item.id === kycBlock.transfer.id));
  assert.ok(history.every((item) => item.createdAt && !("envelope_xdr" in item)));
});

test("Horizon tạm lỗi giữ PENDING và retry không gửi lại envelope", async (t) => {
  const email = "alice@example.test";
  const token = (await request("/auth/login", 200, { email, password })).token;
  const { stellarServer } = await import("../src/services/stellarService.js");
  const { signTransaction } = await import("../src/services/stellarTransactions.js");
  const signer = Keypair.random();
  const destination = Keypair.random().publicKey();
  const asset = new Asset("VNDDEMO", Keypair.random().publicKey());
  const transaction = signTransaction(new Account(signer.publicKey(), "0"), signer, [
    Operation.payment({ destination, asset, amount: "1" }),
  ]);
  const requestKey = randomUUID();
  const { rows: [transfer] } = await pool.query(
    `INSERT INTO transfers (
       sender_user_id, recipient_public_key, type, send_asset, send_amount, dest_asset, status, request_key, envelope_xdr
     ) SELECT id, $2, 'DIRECT', 'VNDDEMO', 1, 'VNDDEMO', 'PENDING', $3, $4 FROM users WHERE email = $1 RETURNING id`,
    [email, destination, requestKey, transaction.toXDR()],
  );
  let horizonAvailable = false;
  t.mock.method(stellarServer, "transactions", () => ({
    transaction: () => ({
      call: async () => {
        if (!horizonAvailable) throw new Error("Horizon unavailable");
        throw new NotFoundError("Not Found");
      },
    }),
  }));
  t.mock.method(stellarServer, "ledgers", () => ({
    order: () => ({
      limit: () => ({
        call: async () => ({ records: [{ closed_at: new Date((Number(transaction.timeBounds.maxTime) + 1) * 1000).toISOString() }] }),
      }),
    }),
  }));
  const submit = t.mock.method(stellarServer, "submitTransaction", async () => {
    throw new Error("A replay must not send a new payment");
  });

  const path = `/transfers/${transfer.id}`;
  const pending = (await request(path, 200, undefined, token)).transfer;
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.txHash, null);
  assert.equal(pending.envelope_xdr, undefined);
  horizonAvailable = true;
  const replay = await fetch(base + "/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": requestKey },
    body: JSON.stringify({ type: "DIRECT", assetCode: "VNDDEMO", amount: "1", destination }),
  });
  assert.equal(replay.status, 409);
  const { transfer: resolved } = await replay.json();
  assert.equal(resolved.id, transfer.id);
  assert.equal(resolved.status, "FAILED");
  assert.equal(resolved.errorCode, "EXPIRED");
  assert.equal(resolved.txHash, null);
  assert.equal(submit.mock.callCount(), 0);
});
