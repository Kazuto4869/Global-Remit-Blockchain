import { Operation } from "@stellar/stellar-sdk";
import { pool } from "../src/db.js";
import { toUnits } from "../src/services/amount.js";
import { checkPayment, checkReserve, demoAsset, trustline } from "../src/services/stellarPayments.js";
import { loadTestnetAccount, stellarServer, StellarDemoError, transactionExplorerUrl } from "../src/services/stellarService.js";
import { submitOnce } from "../src/services/stellarTransactions.js";
import { lockWalletStore, readWalletStore, withWalletTransaction } from "../src/services/walletStore.js";

const price = "25000";
const amount = "100";
const reserveStock = "200";
const createPrefix = "market-offer-create:";
const removePrefix = "market-offer-remove:";

async function marketAccount(publicKey) {
  const account = await loadTestnetAccount(publicKey);
  if (!account) throw new StellarDemoError(409, "Ví market maker chưa tồn tại trên Testnet.");
  return account;
}

async function findOffer(publicKey, selling, buying) {
  const { records } = await stellarServer.offers().forAccount(publicKey).limit(2).call();
  if (!records.length) return null;
  const [offer] = records;
  if (records.length !== 1 || offer.selling.asset_code !== selling.getCode() ||
      offer.selling.asset_issuer !== selling.getIssuer() || offer.buying.asset_code !== buying.getCode() ||
      offer.buying.asset_issuer !== buying.getIssuer() ||
      BigInt(offer.price_r.n) !== BigInt(price) * BigInt(offer.price_r.d)) {
    throw new StellarDemoError(409, "Ví market maker có offer ngoài cấu hình demo. Dừng để tránh tạo trùng.");
  }
  return offer;
}

async function fundMarketMaker(store, marketMaker, selling, buying) {
  const publicKey = marketMaker.publicKey();
  const account = await marketAccount(publicKey);
  const missing = [selling, buying].filter((asset) => !trustline(account, asset));
  const savedTrust = store.bootstrap["market-trustlines"];
  if (missing.length && savedTrust?.status === "CONFIRMED") {
    throw new StellarDemoError(409, "Horizon không thấy trustline market maker đã xác nhận trước đây.");
  }
  if (missing.length || savedTrust?.status === "PENDING") {
    if (savedTrust?.status !== "PENDING") await checkReserve(account, missing.length, missing.length);
    const hash = await submitOnce(store, "market-trustlines", marketMaker,
      missing.map((asset) => Operation.changeTrust({ asset })));
    console.log(`Trustlines market maker: ${transactionExplorerUrl(hash)}`);
  }

  const distributor = store.findKeypair("system:distributor");
  if (!distributor) throw new StellarDemoError(409, "Chạy Stellar bootstrap để tạo distributor.");
  const step = "fund-market-maker";
  const savedFund = store.bootstrap[step];
  if (!savedFund || savedFund.status === "FAILED") {
    const source = await loadTestnetAccount(distributor.publicKey());
    if (!source) throw new StellarDemoError(409, "Distributor chưa tồn tại trên Testnet.");
    await checkPayment(source, publicKey, selling, toUnits(reserveStock));
  }
  const hash = await submitOnce(store, step, distributor, [
    Operation.payment({ destination: publicKey, asset: selling, amount: reserveStock }),
  ]);
  console.log(`Distributor cấp ${reserveStock} USDDEMO: ${transactionExplorerUrl(hash)}`);
}

async function manageOffer(client, mode) {
  await lockWalletStore(client);
  const store = await readWalletStore();
  const marketMaker = store.findKeypair("system:marketMaker");
  if (!marketMaker) throw new StellarDemoError(409, "Chạy Stellar bootstrap để tạo market maker.");
  const publicKey = marketMaker.publicKey();
  const selling = demoAsset(store, "USDDEMO");
  const buying = demoAsset(store, "VNDDEMO");
  const offer = await findOffer(publicKey, selling, buying);
  // Hash xóa offer trước đó tạo lượt mới, còn retry trong cùng lượt dùng lại envelope.
  const lastRemoval = Object.entries(store.bootstrap).findLast(([step, tx]) =>
    step.startsWith(removePrefix) && tx.status === "CONFIRMED")?.[1];
  const cycle = lastRemoval?.hash ?? "initial";
  const createStep = createPrefix + cycle;
  const removeStep = removePrefix + cycle;
  const create = store.bootstrap[createStep];
  const removal = store.bootstrap[removeStep];

  if (mode === "remove") {
    if (create?.status === "PENDING") throw new StellarDemoError(409, "Chạy setup lại để xác nhận offer đang tạo.");
    if (!offer && removal?.status !== "PENDING") {
      console.log(lastRemoval ? `Offer đã xóa: ${transactionExplorerUrl(lastRemoval.hash)}` : "Market maker không có offer.");
      return;
    }
    const operations = offer ? [Operation.manageSellOffer({ selling, buying, price, amount: "0", offerId: offer.id })] : [];
    const hash = await submitOnce(store, removeStep, marketMaker, operations);
    if (await findOffer(publicKey, selling, buying)) throw new StellarDemoError(503, "Horizon vẫn thấy offer sau khi xóa. Hãy kiểm tra lại.");
    console.log(`Offer đã xóa: ${transactionExplorerUrl(hash)}`);
    return;
  }

  if (removal?.status === "PENDING") throw new StellarDemoError(409, "Chạy lại lệnh remove để xác nhận lần xóa trước.");
  if ((offer && (!create || create.status === "FAILED")) || (!offer && create?.status === "CONFIRMED")) {
    throw new StellarDemoError(409, "Offer trên Horizon không khớp lịch sử local. Dừng để tránh tạo trùng.");
  }
  await fundMarketMaker(store, marketMaker, selling, buying);
  if (!offer && create?.status !== "PENDING") {
    const account = await marketAccount(publicKey);
    const sellLine = trustline(account, selling);
    const buyLine = trustline(account, buying);
    if (!sellLine?.is_authorized || !buyLine?.is_authorized) {
      throw new StellarDemoError(409, "Market maker cần trustline đã được cấp quyền cho cả hai asset.");
    }
    const sellingUnits = toUnits(amount);
    if (toUnits(sellLine.balance) - toUnits(sellLine.selling_liabilities ?? "0") < sellingUnits) {
      throw new StellarDemoError(409, "Market maker cần ít nhất 100 USDDEMO khả dụng để đặt offer.");
    }
    const buyingCapacity = toUnits(buyLine.limit) - toUnits(buyLine.balance) - toUnits(buyLine.buying_liabilities ?? "0");
    if (buyingCapacity < sellingUnits * BigInt(price)) {
      throw new StellarDemoError(409, "Trustline VNDDEMO của market maker không đủ hạn mức cho offer.");
    }
    await checkReserve(account, 1);
  }
  const hash = await submitOnce(store, createStep, marketMaker, [
    Operation.manageSellOffer({ selling, buying, price, amount, offerId: "0" }),
  ]);
  const active = await findOffer(publicKey, selling, buying);
  if (!active) throw new StellarDemoError(409, "Stellar xác nhận giao dịch nhưng Horizon không thấy offer đang mở.");
  console.log(`Sell offer #${active.id}: còn ${active.amount} USDDEMO, giá ${price} VNDDEMO/USDDEMO.`);
  console.log(transactionExplorerUrl(hash));
}

try {
  const mode = process.argv[2] ?? "setup";
  if (mode !== "setup" && mode !== "remove") throw new StellarDemoError(400, "Chọn setup hoặc remove.");
  await withWalletTransaction((client) => manageOffer(client, mode));
} catch (error) {
  console.error(error instanceof StellarDemoError ? error.message : "Chưa hoàn tất cập nhật offer. Kiểm tra PostgreSQL và Horizon.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
