import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPixPayload, validatePixKey } from "../src/server/pix-static.js";

test("static Pix payload validates key and includes CRC", () => {
  assert.equal(validatePixKey("email", "tesouraria@example.org"), true);
  const payload = buildPixPayload({
    key: "tesouraria@example.org",
    keyType: "email",
    merchantName: "Igreja Esperanca",
    merchantCity: "Sao Paulo",
    amount: 25.5,
  });
  assert.match(payload, /^000201/);
  assert.match(payload, /BR.GOV.BCB.PIX/);
  assert.match(payload, /540525.50/);
  assert.match(payload, /6304[0-9A-F]{4}$/);
});

test("static Pix payload rejects invalid key type", () => {
  assert.equal(validatePixKey("email", "invalido"), false);
  assert.throws(() =>
    buildPixPayload({
      key: "invalido",
      keyType: "email",
      merchantName: "Igreja",
      merchantCity: "Recife",
    }),
  );
});
