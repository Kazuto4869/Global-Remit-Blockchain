import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, NotFoundError } from "@stellar/stellar-sdk";
import { ensureFundedAccount, stellarServer } from "../src/services/stellarService.js";

test("Friendbot thất bại và Horizon chưa thấy tài khoản thì báo 503", async (t) => {
  const publicKey = Keypair.random().publicKey();
  t.mock.method(stellarServer, "loadAccount", async () => { throw new NotFoundError("Not Found"); });
  t.mock.method(stellarServer, "friendbot", () => ({
    call: async () => { throw new Error("Friendbot unavailable"); },
  }));
  await assert.rejects(ensureFundedAccount(publicKey), { status: 503, message: /Friendbot/ });
});
