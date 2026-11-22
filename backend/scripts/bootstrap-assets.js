import { Asset, Operation } from "@stellar/stellar-sdk";
import { pool } from "../src/db.js";
import {
  accountExplorerUrl, ensureFundedAccount, stellarServer,
  StellarDemoError, transactionExplorerUrl,
} from "../src/services/stellarService.js";
import { lockWalletStore, readWalletStore, withWalletTransaction } from "../src/services/walletStore.js";

import { submitOnce } from "../src/services/stellarTransactions.js";

async function bootstrap(client) {
  await lockWalletStore(client);
  const store = await readWalletStore();
  const accounts = {};
  for (const role of ["issuer", "distributor", "marketMaker"]) {
    const keypair = await store.getKeypair(`system:${role}`);
    const address = keypair.publicKey();
    await ensureFundedAccount(address);
    accounts[role] = keypair;
    console.log(`${role}: ${address}`);
    console.log(accountExplorerUrl(address));
  }

  const { issuer, distributor } = accounts;
  const issuerAddress = issuer.publicKey();
  const destination = distributor.publicKey();
  const assets = [
    { asset: new Asset("VNDDEMO", issuerAddress), amount: "5000000" },
    { asset: new Asset("USDDEMO", issuerAddress), amount: "1000" },
  ];
  const trustHash = await submitOnce(store, "trustlines", distributor,
    assets.map(({ asset }) => Operation.changeTrust({ asset })));
  console.log(`Trustlines (distributor): ${transactionExplorerUrl(trustHash)}`);

  const beforeIssue = await stellarServer.loadAccount(destination);
  for (const { asset } of assets) {
    const line = beforeIssue.balances.find((balance) =>
      balance.asset_code === asset.getCode() && balance.asset_issuer === issuerAddress);
    if (!line) throw new StellarDemoError(409, `Distributor thiếu trustline ${asset.getCode()}.`);
    const previous = store.bootstrap.issuance;
    if ((!previous || previous.status === "FAILED") && !/^0(?:\.0+)?$/.test(line.balance)) {
      throw new StellarDemoError(409, `Đã có số dư ${asset.getCode()} mà chưa có hash phát hành hợp lệ. Dừng để tránh phát hành trùng.`);
    }
  }

  const issuanceHash = await submitOnce(store, "issuance", issuer,
    assets.map(({ asset, amount }) => Operation.payment({ asset, amount, destination })));
  console.log(`Issuance (issuer): ${transactionExplorerUrl(issuanceHash)}`);

  const account = await stellarServer.loadAccount(destination);
  console.log("Số dư distributor từ Horizon:");
  for (const balance of account.balances) {
    if (balance.asset_type === "native") console.log(`  XLM: ${balance.balance}`);
    if (balance.asset_issuer === issuerAddress) console.log(`  ${balance.asset_code}: ${balance.balance}`);
  }
}

try {
  await withWalletTransaction(bootstrap);
} catch (error) {
  console.error(error instanceof StellarDemoError ? error.message : "Bootstrap chưa hoàn tất. Kiểm tra PostgreSQL và Horizon, rồi chạy lại.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
