import { SCALE, parseAmount } from "./amount.js";
import { withWalletTransaction } from "./walletStore.js";

const LIMIT = 1_000_000n * SCALE;
const USD_RATE = 25_000n;

export async function checkAml(user, assetCode, amount) {
  if (assetCode !== "VNDDEMO" && assetCode !== "USDDEMO") return null;
  const units = parseAmount(amount);
  if (units === null) return null;
  return withWalletTransaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    return evaluateAml(client, user.id, assetCode, amount, units, true);
  });
}

// Caller giữ khóa hàng user cho đến khi lưu quyết định và bản ghi transfer.
export async function evaluateAml(client, userId, assetCode, amount, units, demo = false) {
  const equivalent = assetCode === "USDDEMO" ? units * USD_RATE : units;
  const { rows: [profile] } = await client.query(
    `SELECT k.status, (w.id IS NOT NULL) AS blocked
     FROM kyc_submissions k LEFT JOIN aml_watchlist w ON w.demo_id = k.demo_id
     WHERE k.user_id = $1 ORDER BY k.id DESC LIMIT 1`,
    [userId],
  );

  let reason = null;
  if (profile?.status !== "APPROVED") reason = "KYC_REQUIRED";
  else if (equivalent > LIMIT) reason = "LIMIT";
  else if (profile.blocked) reason = "WATCHLIST";
  else {
    const query = demo
      ? `SELECT count(*)::integer AS accepted FROM aml_checks
         WHERE user_id = $1 AND is_demo AND result = 'PASS'
           AND created_at > statement_timestamp() - interval '24 hours'`
      : `SELECT count(*)::integer AS accepted FROM transfers
         WHERE sender_user_id = $1 AND status IN ('PENDING', 'CONFIRMED')
           AND created_at > statement_timestamp() - interval '24 hours'`;
    const { rows: [window] } = await client.query(query, [userId]);
    if (window.accepted >= 3) reason = "FREQUENCY";
  }

  const result = reason ? "FAIL" : "PASS";
  await client.query(
    "INSERT INTO aml_checks (user_id, asset_code, amount, result, reason, is_demo) VALUES ($1, $2, $3, $4, $5, $6)",
    [userId, assetCode, amount, result, reason, demo],
  );
  return { result, reason };
}
