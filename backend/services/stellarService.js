import { Horizon, Networks } from "@stellar/stellar-sdk";

// Kết nối tới Horizon của Stellar Testnet.
export const stellarServer = new Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

// Network passphrase dùng để ký giao dịch Testnet.
export const networkPassphrase = Networks.TESTNET;

// Kiểm tra kết nối tới blockchain.
export async function checkStellarConnection() {
  const response = await stellarServer
    .ledgers()
    .order("desc")
    .limit(1)
    .call();

  return response.records[0].sequence;
}