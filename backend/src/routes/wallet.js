import { Router } from "express";
import { Operation } from "@stellar/stellar-sdk";
import { accountExplorerUrl, ensureFundedAccount, loadTestnetAccount, StellarDemoError, transactionExplorerUrl } from "../services/stellarService.js";
import { checkReserve, demoAsset, hasPendingTrustline, trustline } from "../services/stellarPayments.js";
import { submitOnce } from "../services/stellarTransactions.js";
import { lockWalletStore, readWalletStore, withWalletTransaction } from "../services/walletStore.js";

export const walletRoutes = Router();

walletRoutes.get("/", async (req, res) => {
  const publicKey = req.user.stellar_public_key;
  if (!publicKey) throw new StellarDemoError(409, "Hãy tạo ví Stellar Testnet trước.");
  const account = await loadTestnetAccount(publicKey);
  if (!account) throw new StellarDemoError(409, "Ví chưa tồn tại trên Testnet.");
  const store = await readWalletStore();
  const issuer = store.findKeypair("system:issuer")?.publicKey();
  const balances = account.balances
    .filter((line) => line.asset_type === "native" || (issuer && line.asset_issuer === issuer &&
      (line.asset_code === "VNDDEMO" || line.asset_code === "USDDEMO")))
    .map((line) => ({ assetCode: line.asset_type === "native" ? "XLM" : line.asset_code, balance: line.balance }));
  res.json({ publicKey, balances });
});

async function lockApprovedUser(client, userId) {
  const { rows: [user] } = await client.query(
    "SELECT stellar_public_key FROM users WHERE id = $1 FOR UPDATE", [userId],
  );
  const { rows: [kyc] } = await client.query(
    "SELECT status FROM kyc_submissions WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId],
  );
  if (kyc?.status !== "APPROVED") throw new StellarDemoError(403, "Hồ sơ KYC chưa được duyệt.");
  return user;
}

walletRoutes.post("/", async (req, res) => {
  const wallet = await withWalletTransaction(async (client) => {
    const user = await lockApprovedUser(client, req.user.id);

    await lockWalletStore(client);
    const store = await readWalletStore();
    const label = `customer:${req.user.id}:${req.user.email}`;
    const keypair = await store.getKeypair(label, user.stellar_public_key);
    const publicKey = keypair.publicKey();
    await ensureFundedAccount(publicKey);
    if (!user.stellar_public_key) {
      await client.query("UPDATE users SET stellar_public_key = $1 WHERE id = $2", [publicKey, req.user.id]);
    }
    return { publicKey, explorerUrl: accountExplorerUrl(publicKey) };
  });
  res.json(wallet);
});

walletRoutes.post("/trustlines", async (req, res) => {
  const { assetCode } = req.body ?? {};
  if (assetCode !== "VNDDEMO" && assetCode !== "USDDEMO") {
    throw new StellarDemoError(400, "Chọn VNDDEMO hoặc USDDEMO.");
  }
  const result = await withWalletTransaction(async (client) => {
    const { stellar_public_key: publicKey } = await lockApprovedUser(client, req.user.id);
    if (!publicKey) throw new StellarDemoError(409, "Hãy tạo ví Stellar Testnet trước.");
    await lockWalletStore(client);
    const store = await readWalletStore();
    const asset = demoAsset(store, assetCode);
    const account = await loadTestnetAccount(publicKey);
    if (!account) throw new StellarDemoError(409, "Ví chưa tồn tại trên Testnet.");
    const step = `trustline:${publicKey}:${assetCode}`;
    const existing = trustline(account, asset);
    const saved = store.bootstrap[step];
    if (existing && !existing.is_authorized) throw new StellarDemoError(409, "Trustline chưa được issuer cấp quyền.");
    if (existing && (!saved || saved.status === "FAILED")) {
      return { assetCode, publicKey, txHash: null, explorerUrl: null };
    }
    if (!existing && saved?.status === "CONFIRMED") {
      throw new StellarDemoError(409, "Trustline đã xác nhận trước đây nhưng Horizon hiện không thấy.");
    }
    if (!existing) {
      if (hasPendingTrustline(store, publicKey, step)) {
        throw new StellarDemoError(409, "Ví có trustline đang chờ. Hãy kiểm tra lại trustline đó trước.");
      }
      const pending = await client.query(
        "SELECT id FROM transfers WHERE sender_user_id = $1 AND status = 'PENDING' LIMIT 1", [req.user.id],
      );
      if (pending.rowCount) throw new StellarDemoError(409, "Ví đang có giao dịch chờ xác nhận.");
      await checkReserve(account, 1);
    }
    const keypair = await store.getKeypair(`customer:${req.user.id}:${req.user.email}`, publicKey);
    const txHash = await submitOnce(store, step, keypair, [Operation.changeTrust({ asset })]);
    return { assetCode, publicKey, txHash, explorerUrl: transactionExplorerUrl(txHash) };
  });
  res.json(result);
});
