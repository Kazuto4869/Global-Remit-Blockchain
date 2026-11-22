import { BASE_FEE, NotFoundError, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { loadTestnetAccount, networkPassphrase, stellarServer, StellarDemoError } from "./stellarService.js";

export function signTransaction(source, signer, operations) {
  const builder = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase });
  for (const operation of operations) builder.addOperation(operation);
  const transaction = builder.setTimeout(300).build();
  transaction.sign(signer);
  return transaction;
}

export function transactionHash(transaction) {
  return Buffer.from(transaction.hash()).toString("hex");
}

export async function submitToHorizon(transaction) {
  try {
    const response = await stellarServer.submitTransaction(transaction);
    if (response.hash === transactionHash(transaction) && response.successful === true &&
        response.fee_charged !== undefined && response.created_at && response.result_xdr) return response;
  } catch {
    // Timeout hoặc phản hồi lỗi vẫn có thể cần tra cứu hash để biết kết quả.
  }
  return findTransaction(transactionHash(transaction));
}

export async function findTransaction(hash) {
  try {
    return await stellarServer.transactions().transaction(hash).call();
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw new StellarDemoError(503, "Horizon chưa tra cứu được giao dịch. Hãy thử lại.", "HORIZON");
  }
}

export function readPathResult(resultXdr) {
  if (!resultXdr) return null;
  const { result } = xdr.TransactionResult.fromXdr(resultXdr, "base64");
  return result.results?.[0]?.tr?.pathPaymentStrictSendResult ?? null;
}

export async function submitOnce(store, step, signer, operations) {
  let entry = store.bootstrap[step];
  if (!entry || entry.status === "FAILED") {
    const source = await loadTestnetAccount(signer.publicKey());
    if (!source) throw new StellarDemoError(409, "Ví nguồn chưa tồn tại trên Testnet.");
    const transaction = signTransaction(source, signer, operations);
    entry = { status: "PENDING", hash: transactionHash(transaction), xdr: transaction.toXDR() };
    store.bootstrap[step] = entry;
    await store.save();
  }

  let record = await findTransaction(entry.hash);
  if (!record && entry.status === "PENDING") {
    // Gửi lại đúng envelope đã lưu nếu lần trước chưa rõ kết quả.
    const transaction = TransactionBuilder.fromXDR(entry.xdr, networkPassphrase);
    record = await submitToHorizon(transaction);
  }

  if (typeof record?.successful !== "boolean") {
    throw new StellarDemoError(503, `${step}: Horizon chưa xác nhận hash ${entry.hash}. Chạy lại để tra cứu cùng hash.`);
  }
  const status = record.successful ? "CONFIRMED" : "FAILED";
  if (entry.status !== status) {
    store.bootstrap[step] = { status, hash: entry.hash };
    await store.save();
  }
  if (!record.successful) {
    throw new StellarDemoError(503, `${step}: Horizon xác nhận giao dịch thất bại (${entry.hash}).`);
  }
  return entry.hash;
}
