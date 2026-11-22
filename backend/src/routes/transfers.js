import { randomUUID } from "node:crypto";
import { Operation, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { Router } from "express";
import { pool } from "../db.js";
import { evaluateAml } from "../services/aml.js";
import { fromUnits, parseAmount, toUnits } from "../services/amount.js";
import { checkPayment, demoAsset, hasPendingTrustline } from "../services/stellarPayments.js";
import {
  latestLedger, loadTestnetAccount, networkPassphrase, StellarDemoError, transactionExplorerUrl,
} from "../services/stellarService.js";
import { findTransaction, readPathResult, signTransaction, submitToHorizon, transactionHash } from "../services/stellarTransactions.js";
import { readWalletStore, withWalletTransaction } from "../services/walletStore.js";

export const transferRoutes = Router();
const amlErrors = {
  KYC_REQUIRED: "Hồ sơ KYC chưa được duyệt.",
  LIMIT: "Số tiền vượt hạn mức AML.",
  WATCHLIST: "Mã hồ sơ nằm trong watchlist AML.",
  FREQUENCY: "Đã đủ 3 giao dịch trong 24 giờ.",
};
const pendingMessage = "Horizon chưa xác nhận. Tra cứu giao dịch bằng ID hoặc gửi lại cùng Idempotency-Key.";
const pathErrors = {
  pathPaymentStrictSendTooFewOffers: { code: "NO_LIQUIDITY", message: "Stellar không có đủ thanh khoản trực tiếp VNDDEMO → USDDEMO." },
  pathPaymentStrictSendUnderDestmin: { code: "DEST_MIN", message: "Số USDDEMO thực tế có thể nhận thấp hơn mức tối thiểu yêu cầu." },
};

async function saveTransfer(client, userId, request, status, error, xdr) {
  const { rows: [transfer] } = await client.query(
    `INSERT INTO transfers (
       sender_user_id, recipient_public_key, type, send_asset, send_amount, dest_asset, dest_min,
       request_key, status, error_code, error_message, envelope_xdr
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [userId, request.destination, request.type, request.assetCode, request.amount, request.destCode,
      request.destMin, request.requestKey, status, error?.code, error?.message, xdr],
  );
  return transfer;
}

async function findTransfer(id, userId) {
  const { rows: [transfer] } = await pool.query(
    "SELECT * FROM transfers WHERE id = $1 AND sender_user_id = $2", [id, userId],
  );
  return transfer;
}

async function resolveTransfer(transfer, submit = false) {
  if (transfer.status !== "PENDING") return transfer;
  const transaction = TransactionBuilder.fromXDR(transfer.envelope_xdr, networkPassphrase);
  const hash = transactionHash(transaction);
  let record;
  try {
    record = submit ? await submitToHorizon(transaction) : await findTransaction(hash);
    if (!record) {
      const ledger = await latestLedger();
      if (!(Date.parse(ledger.closed_at) > Number(transaction.timeBounds.maxTime) * 1000)) return transfer;
      // Tra cứu lại sau khi biết ledger đã đóng ngoài time bounds của envelope.
      record = await findTransaction(hash);
    }
  } catch (error) {
    if (!(error instanceof StellarDemoError)) throw error;
    return transfer;
  }
  if (record && (typeof record.successful !== "boolean" || record.hash !== hash ||
      record.fee_charged === undefined || !record.created_at)) return transfer;

  const confirmed = record?.successful === true;
  const pathResult = transfer.type === "PATH" && record ? readPathResult(record.result_xdr) : null;
  let received = null;
  if (confirmed) {
    if (transfer.type === "PATH") {
      // Số tiền thực nhận lấy từ kết quả operation đã đóng ledger.
      if (pathResult?.type !== "pathPaymentStrictSendSuccess") return transfer;
      received = fromUnits(pathResult.success.last.amount);
    } else {
      received = transfer.send_amount;
    }
  }
  const failure = confirmed ? null : record
    ? pathErrors[pathResult?.type] ?? { code: "STELLAR_REJECTED", message: "Stellar ghi nhận giao dịch thất bại." }
    : { code: "EXPIRED", message: "Giao dịch đã hết hạn và Horizon không ghi nhận hash." };
  const { rows: [updated] } = await pool.query(
    `UPDATE transfers SET status = $2, tx_hash = $3, fee_xlm = $4, error_code = $5, error_message = $6,
       received_amount = $8,
       confirmed_at = CASE WHEN $2 = 'CONFIRMED' THEN $7::timestamptz END, envelope_xdr = NULL
     WHERE id = $1 AND status = 'PENDING' RETURNING *`,
    [transfer.id, confirmed ? "CONFIRMED" : "FAILED", record ? hash : null,
      record ? fromUnits(BigInt(record.fee_charged)) : null, failure?.code, failure?.message, record?.created_at, received],
  );
  return updated ?? findTransfer(transfer.id, transfer.sender_user_id);
}

function publicTransfer(row) {
  return {
    id: row.id, type: row.type, status: row.status, destination: row.recipient_public_key,
    sendAsset: row.send_asset, sendAmount: row.send_amount, destAsset: row.dest_asset,
    destMin: row.dest_min, receivedAmount: row.received_amount, txHash: row.tx_hash, feeXlm: row.fee_xlm,
    explorerUrl: row.tx_hash ? transactionExplorerUrl(row.tx_hash) : null,
    errorCode: row.error_code, error: row.status === "PENDING" ? pendingMessage : row.error_message,
    createdAt: row.created_at, confirmedAt: row.confirmed_at,
    requestKey: row.request_key,
  };
}

transferRoutes.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM transfers WHERE sender_user_id = $1 ORDER BY id DESC LIMIT 20",
    [req.user.id],
  );
  const transfers = await Promise.all(rows.map(async (row) =>
    publicTransfer(row.status === "PENDING" && row.envelope_xdr ? await resolveTransfer(row) : row),
  ));
  res.json({ transfers });
});

transferRoutes.post("/", async (req, res) => {
  const { type, assetCode, amount, destination, destMin } = req.body ?? {};
  const units = parseAmount(amount);
  const isPath = type === "PATH";
  const minimum = isPath ? parseAmount(destMin) : null;
  if ((!isPath && type !== "DIRECT") || assetCode !== "VNDDEMO" || units === null ||
      typeof destination !== "string" || !StrKey.isValidEd25519PublicKey(destination)) {
    throw new StellarDemoError(400, "Chọn DIRECT hoặc PATH, VNDDEMO, địa chỉ ví nhận và số tiền dạng chuỗi thập phân dương (tối đa 7 số lẻ).");
  }
  if (isPath && minimum === null) {
    throw new StellarDemoError(400, "Nhập destMin bằng chuỗi thập phân USDDEMO dương (tối đa 7 số lẻ).");
  }
  const requestKey = req.get("Idempotency-Key") ?? randomUUID();
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(requestKey)) {
    throw new StellarDemoError(400, "Idempotency-Key phải là UUID.");
  }
  const destCode = isPath ? "USDDEMO" : assetCode;
  const request = { type, assetCode, amount, destination, destCode, destMin: isPath ? destMin : null, requestKey };

  const { id: userId, email } = req.user;
  const prepared = await withWalletTransaction(async (client) => {
    const { rows: [user] } = await client.query(
      "SELECT stellar_public_key FROM users WHERE id = $1 FOR UPDATE", [userId],
    );
    const { rows: [previous] } = await client.query(
      "SELECT * FROM transfers WHERE sender_user_id = $1 AND request_key = $2", [userId, requestKey],
    );
    if (previous) {
      if (previous.type !== type || previous.recipient_public_key !== destination || toUnits(previous.send_amount) !== units ||
          (isPath && (previous.dest_min === null || toUnits(previous.dest_min) !== minimum))) {
        throw new StellarDemoError(409, "Idempotency-Key đã được dùng với dữ liệu khác.");
      }
      return { transfer: previous, submit: false };
    }

    const persist = (status, error, xdr) =>
      saveTransfer(client, userId, request, status, error, xdr);
    const { reason } = await evaluateAml(client, userId, assetCode, amount, units);
    if (reason) {
      const status = reason === "KYC_REQUIRED" ? "BLOCKED_KYC" : "BLOCKED_AML";
      return { transfer: await persist(status, { code: reason, message: amlErrors[reason] }), submit: false };
    }

    const { rows: [pending] } = await client.query(
      "SELECT id FROM transfers WHERE sender_user_id = $1 AND status = 'PENDING' LIMIT 1", [userId],
    );
    if (pending) return { pendingId: pending.id };
    try {
      const publicKey = user.stellar_public_key;
      if (!publicKey) throw new StellarDemoError(409, "Bạn cần tạo ví Stellar Testnet trước.", "NO_WALLET");
      if (publicKey === destination) throw new StellarDemoError(409, "Địa chỉ nhận trùng với ví gửi.", "SELF_PAYMENT");
      const store = await readWalletStore();
      if (hasPendingTrustline(store, publicKey)) {
        throw new StellarDemoError(409, "Ví có trustline đang chờ. Hãy kiểm tra lại trustline đó trước.", "TRUSTLINE_PENDING");
      }
      const asset = demoAsset(store, assetCode);
      const destAsset = isPath ? demoAsset(store, destCode) : asset;
      const source = await loadTestnetAccount(publicKey);
      if (!source) throw new StellarDemoError(409, "Ví gửi chưa tồn tại trên Testnet.", "NO_WALLET");
      await checkPayment(source, destination, asset, units, destAsset, minimum ?? units);
      const signer = await store.getKeypair(`customer:${userId}:${email}`, publicKey);
      const operation = isPath
        ? Operation.pathPaymentStrictSend({
          sendAsset: asset, sendAmount: fromUnits(units), destination,
          destAsset, destMin: fromUnits(minimum), path: [],
        })
        : Operation.payment({ asset, amount: fromUnits(units), destination });
      const transaction = signTransaction(source, signer, [operation]);
      return { transfer: await persist("PENDING", null, transaction.toXDR()), submit: true };
    } catch (error) {
      if (!(error instanceof StellarDemoError) || error.status === 500) throw error;
      return { transfer: await persist("FAILED", error), submit: false };
    }
  });

  if (prepared.pendingId) {
    return res.status(409).json({ error: "Ví đang có giao dịch chờ. Tra cứu giao dịch đó trước khi gửi tiếp.", transferId: prepared.pendingId });
  }
  // PostgreSQL đã COMMIT PENDING trước khi có thể gửi transaction.
  const transfer = publicTransfer(await resolveTransfer(prepared.transfer, prepared.submit));
  let status = 200;
  if (transfer.status === "PENDING") status = 202;
  else if (transfer.status.startsWith("BLOCKED")) status = 403;
  else if (transfer.status === "FAILED") status = transfer.errorCode === "HORIZON" ? 503 : 409;
  else if (prepared.submit) status = 201;
  res.status(status).json({ transfer, ...(transfer.error && { error: transfer.error }) });
});

transferRoutes.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!/^[0-9]+$/.test(req.params.id) || !(id > 0 && id <= 2_147_483_647)) {
    throw new StellarDemoError(400, "ID giao dịch không hợp lệ.");
  }
  const transfer = await findTransfer(id, req.user.id);
  if (!transfer) throw new StellarDemoError(404, "Không tìm thấy giao dịch.");
  res.json({ transfer: publicTransfer(await resolveTransfer(transfer)) });
});
