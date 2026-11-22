import { Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { toUnits } from "./amount.js";
import { latestLedger, loadTestnetAccount, StellarDemoError } from "./stellarService.js";

export function demoAsset(store, code) {
  const issuer = store.findKeypair("system:issuer");
  if (!issuer) throw new StellarDemoError(409, "Chạy Stellar bootstrap để tạo issuer trước.", "NO_ISSUER");
  return new Asset(code, issuer.publicKey());
}

export function trustline(account, asset) {
  return account.balances.find((line) => line.asset_code === asset.getCode() && line.asset_issuer === asset.getIssuer());
}

export function hasPendingTrustline(store, publicKey, currentStep) {
  return Object.entries(store.bootstrap).some(([step, entry]) =>
    step !== currentStep && step.startsWith(`trustline:${publicKey}:`) && entry.status === "PENDING");
}

export async function checkReserve(account, extraEntries = 0, operationCount = 1) {
  const ledger = await latestLedger();
  const native = account.balances.find((line) => line.asset_type === "native");
  const entries = 2 + account.subentry_count + (account.num_sponsoring ?? 0) - (account.num_sponsored ?? 0) + extraEntries;
  const reserveAndFee = BigInt(entries) * BigInt(ledger.base_reserve_in_stroops) + BigInt(BASE_FEE) * BigInt(operationCount);
  if (!native || toUnits(native.balance) - toUnits(native.selling_liabilities ?? "0") < reserveAndFee) {
    throw new StellarDemoError(409, "Ví gửi không đủ XLM cho dự trữ và phí mạng.", "NO_XLM");
  }
}

export async function checkPayment(source, destinationKey, asset, units, destAsset = asset, destUnits = units) {
  const destination = await loadTestnetAccount(destinationKey);
  if (!destination) throw new StellarDemoError(409, "Ví nhận chưa tồn tại trên Stellar Testnet.", "NO_DESTINATION");

  const destLine = trustline(destination, destAsset);
  if (!destLine?.is_authorized) {
    throw new StellarDemoError(409, "Ví nhận thiếu trustline đã được cấp quyền cho tài sản.", "NO_TRUSTLINE");
  }
  const capacity = toUnits(destLine.limit) - toUnits(destLine.balance) - toUnits(destLine.buying_liabilities ?? "0");
  if (capacity < destUnits) {
    throw new StellarDemoError(409, "Trustline của ví nhận không còn đủ hạn mức.", "DESTINATION_LIMIT");
  }

  const sourceLine = trustline(source, asset);
  if (!sourceLine?.is_authorized || toUnits(sourceLine.balance) - toUnits(sourceLine.selling_liabilities ?? "0") < units) {
    throw new StellarDemoError(409, "Ví gửi không đủ số dư tài sản có thể chuyển.", "NO_BALANCE");
  }
  await checkReserve(source);
}
