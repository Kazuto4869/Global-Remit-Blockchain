import { Keypair } from "@stellar/stellar-sdk";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { pool } from "../db.js";
import { StellarDemoError } from "./stellarService.js";

const directory = new URL("../../.secrets/", import.meta.url);
const file = new URL("stellar-wallets.json", directory);
const temporary = new URL(".stellar-wallets.json.tmp", directory);

export async function withWalletTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function lockWalletStore(client) {
  // API và CLI dùng chung PostgreSQL để tuần tự hóa việc ghi file cục bộ.
  const { rows: [{ locked }] } = await client.query("SELECT pg_try_advisory_xact_lock(79346, 3) AS locked");
  if (!locked) throw new StellarDemoError(409, "Đang xử lý ví Testnet. Hãy thử lại sau.");
}

export async function readWalletStore() {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new StellarDemoError(500, "Không đọc được kho ví Stellar cục bộ.");
    data = { keys: {}, bootstrap: {} };
  }

  async function save() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const handle = await open(temporary, "w", 0o600);
      try {
        await handle.writeFile(JSON.stringify(data, null, 2) + "\n", "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Thay file sau khi bản ghi mới hoàn chỉnh để lần chạy lại vẫn đọc được khóa.
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  function findKeypair(label) {
    return Object.hasOwn(data.keys, label) ? Keypair.fromSecret(data.keys[label]) : null;
  }

  async function getKeypair(label, publicKey) {
    const existing = findKeypair(label);
    if (existing) {
      if (!publicKey || existing.publicKey() === publicKey) return existing;
    } else if (!publicKey) {
      const keypair = Keypair.random();
      data.keys[label] = keypair.secret();
      await save();
      return keypair;
    }
    throw new StellarDemoError(409, "Khóa của ví đã lưu không khớp với PostgreSQL. Kiểm tra kho ví cục bộ.");
  }

  return { findKeypair, getKeypair, bootstrap: data.bootstrap, save };
}
