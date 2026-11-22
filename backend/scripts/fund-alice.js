import { Operation } from "@stellar/stellar-sdk";
import { pool } from "../src/db.js";
import { toUnits } from "../src/services/amount.js";
import { checkPayment, demoAsset } from "../src/services/stellarPayments.js";
import { loadTestnetAccount, StellarDemoError, transactionExplorerUrl } from "../src/services/stellarService.js";
import { submitOnce } from "../src/services/stellarTransactions.js";
import { lockWalletStore, readWalletStore, withWalletTransaction } from "../src/services/walletStore.js";

try {
  await withWalletTransaction(async (client) => {
    const { rows: [alice] } = await client.query(
      "SELECT id, stellar_public_key FROM users WHERE email = 'alice@globalremit.test' AND role = 'CUSTOMER' FOR UPDATE",
    );
    if (!alice?.stellar_public_key) throw new StellarDemoError(409, "Alice cần tạo ví Testnet trước.");
    const { rows: [kyc] } = await client.query(
      "SELECT status FROM kyc_submissions WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [alice.id],
    );
    if (kyc?.status !== "APPROVED") throw new StellarDemoError(403, "Alice cần được duyệt KYC.");

    await lockWalletStore(client);
    const store = await readWalletStore();
    const distributor = store.findKeypair("system:distributor");
    if (!distributor) throw new StellarDemoError(409, "Chạy Stellar bootstrap để tạo distributor trước.");
    const asset = demoAsset(store, "VNDDEMO");
    const step = "fund-alice";
    const destination = alice.stellar_public_key;
    const amount = "500000";
    const saved = store.bootstrap[step];
    if (!saved || saved.status === "FAILED") {
      const source = await loadTestnetAccount(distributor.publicKey());
      if (!source) throw new StellarDemoError(409, "Distributor chưa tồn tại trên Testnet.");
      await checkPayment(source, destination, asset, toUnits(amount));
    }
    const hash = await submitOnce(store, step, distributor, [Operation.payment({ destination, asset, amount })]);
    console.log(`Distributor → Alice (500000 VNDDEMO): ${transactionExplorerUrl(hash)}`);
  });
} catch (error) {
  console.error(error instanceof StellarDemoError ? error.message : "Chưa hoàn tất cấp VNDDEMO. Kiểm tra PostgreSQL và Horizon.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
