import { Horizon, Networks, NotFoundError } from "@stellar/stellar-sdk";
import { setTimeout as delay } from "node:timers/promises";

// Kết nối tới Horizon của Stellar Testnet.
export const stellarServer = new Horizon.Server(
  "https://horizon-testnet.stellar.org"
);
stellarServer.httpClient.defaults.timeout = 5000;

// Network passphrase dùng để ký giao dịch Testnet.
export const networkPassphrase = Networks.TESTNET;
const explorer = "https://stellar.expert/explorer/testnet";

export class StellarDemoError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const accountExplorerUrl = (publicKey) => `${explorer}/account/${publicKey}`;
export const transactionExplorerUrl = (hash) => `${explorer}/tx/${hash}`;

export async function loadTestnetAccount(publicKey) {
  try {
    return await stellarServer.loadAccount(publicKey);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw new StellarDemoError(503, "Horizon Testnet chưa kiểm tra được tài khoản. Hãy thử lại.", "HORIZON");
  }
}

export async function ensureFundedAccount(publicKey) {
  const existing = await loadTestnetAccount(publicKey);
  if (existing) return existing;
  try {
    await stellarServer.friendbot(publicKey).call();
  } catch {
    // Friendbot có thể đã gửi khi phản hồi bị lỗi, nên kiểm tra lại qua Horizon.
    const funded = await loadTestnetAccount(publicKey);
    if (funded) return funded;
    throw new StellarDemoError(503, "Friendbot chưa cấp được XLM Testnet. Hãy thử lại với cùng ví.");
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await delay(1000);
    const funded = await loadTestnetAccount(publicKey);
    if (funded) return funded;
  }
  throw new StellarDemoError(503, "Horizon chưa thấy ví do Friendbot cấp. Hãy thử lại với cùng ví.");
}

// Kiểm tra kết nối tới blockchain.
export async function latestLedger() {
  try {
    const { records: [ledger] } = await stellarServer.ledgers().order("desc").limit(1).call();
    if (!ledger) throw new Error("Ledger missing");
    return ledger;
  } catch {
    throw new StellarDemoError(503, "Horizon chưa đọc được ledger Stellar Testnet. Hãy thử lại.", "HORIZON");
  }
}

export async function checkStellarConnection() {
  return (await latestLedger()).sequence;
}
