import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { MpesaSignatureService } from "./mpesa-signature.service";

test("MpesaSignatureService rejects callbacks with invalid signatures", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.MPESA_WEBHOOK_PUBLIC_CERT = publicKey.export({ type: "pkcs1", format: "pem" }).toString();

  const service = new MpesaSignatureService();
  const payload = JSON.stringify({ Body: { hello: "world" } });
  const timestamp = new Date().toISOString();
  const signer = createSign("RSA-SHA256");
  signer.update(payload);
  signer.end();
  const signature = signer.sign(privateKey, "base64");

  const valid = service.verify({ payload, signature, timestampHeader: timestamp });
  assert.equal(valid.valid, true);

  const invalid = service.verify({ payload: `${payload}tampered`, signature, timestampHeader: timestamp });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.failureReason, "signature_mismatch");
});
