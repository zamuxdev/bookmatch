import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import azure from "@azure/functions";
const { HttpRequest } = azure;
import { createPayment } from "../dist/functions.js";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const post = (body, headers = { "content-type": "application/json" }) =>
  new HttpRequest({
    method: "POST",
    url: "http://localhost/api/create-payment",
    headers,
    body: { string: body },
  });
const validBody = JSON.stringify({
  title: "Dune",
  author: "Frank Herbert",
  price: 299,
});
test("rejects non-JSON bodies and invalid payloads", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-secret";
  process.env.APP_BASE_URL = "http://localhost:5173";
  globalThis.fetch = async () => {
    throw new Error("fetch must not be called for invalid input");
  };
  assert.equal(
    (await createPayment(post(validBody, { "content-type": "text/plain" })))
      .status,
    415,
  );
  for (const bad of [
    "{",
    JSON.stringify({ author: "Frank Herbert", price: 299 }),
    JSON.stringify({ title: "Dune", author: "Frank Herbert" }),
    JSON.stringify({ title: "", author: "Frank Herbert", price: 299 }),
    JSON.stringify({ title: "Dune", author: "", price: 299 }),
    JSON.stringify({ title: "Dune", author: "Frank Herbert", price: 0 }),
    JSON.stringify({ title: "Dune", author: "Frank Herbert", price: 10001 }),
    JSON.stringify({ title: "Dune", author: "Frank Herbert", price: "299" }),
    JSON.stringify({
      title: "Dune",
      author: "Frank Herbert",
      price: 299,
      currency_id: "USD",
      quantity: 5,
    }),
  ])
    assert.equal((await createPayment(post(bad))).status, 400);
});
test("fails cleanly without MERCADOPAGO_ACCESS_TOKEN", async () => {
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  process.env.APP_BASE_URL = "http://localhost:5173";
  const response = await createPayment(post(validBody));
  assert.equal(response.status, 503);
  assert.equal(response.jsonBody.error.code, "CONFIGURATION");
  assert.ok(!JSON.stringify(response.jsonBody).includes("Bearer"));
});
test("creates a sandbox checkout preference with server-side settings", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-secret";
  process.env.APP_BASE_URL = "https://bookmatch.example.com";
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url, init };
    return Response.json({
      id: "pref-123",
      init_point:
        "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-123",
      sandbox_init_point:
        "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-123",
    });
  };
  const response = await createPayment(post(validBody));
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.preferenceId, "pref-123");
  assert.equal(
    response.jsonBody.checkoutUrl,
    "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-123",
  );
  assert.ok(!JSON.stringify(response.jsonBody).includes("TEST-secret"));
  assert.equal(
    call.url,
    "https://api.mercadopago.com/checkout/preferences",
  );
  assert.equal(call.init.headers.Authorization, "Bearer TEST-secret");
  const payload = JSON.parse(call.init.body);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, "Dune");
  assert.equal(
    payload.items[0].description,
    "Libro recomendado por BookMatch · Frank Herbert",
  );
  assert.equal(payload.items[0].quantity, 1);
  assert.equal(payload.items[0].currency_id, "MXN");
  assert.equal(payload.items[0].unit_price, 299);
  assert.equal(payload.auto_return, "approved");
  assert.deepEqual(payload.back_urls, {
    success: "https://bookmatch.example.com/?payment=success",
    failure: "https://bookmatch.example.com/?payment=failure",
    pending: "https://bookmatch.example.com/?payment=pending",
  });
});
test("omits auto_return for local base URLs, which Mercado Pago rejects", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-secret";
  process.env.APP_BASE_URL = "http://localhost:5173";
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url, init };
    return Response.json({
      id: "pref-789",
      sandbox_init_point:
        "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-789",
    });
  };
  const response = await createPayment(post(validBody));
  assert.equal(response.status, 200);
  const payload = JSON.parse(call.init.body);
  assert.ok(!("auto_return" in payload));
  assert.equal(
    payload.back_urls.success,
    "http://localhost:5173/?payment=success",
  );
});
test("falls back to init_point when no sandbox URL is returned", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-secret";
  process.env.APP_BASE_URL = "http://localhost:5173";
  globalThis.fetch = async () =>
    Response.json({
      id: "pref-456",
      init_point:
        "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-456",
    });
  const response = await createPayment(post(validBody));
  assert.equal(response.status, 200);
  assert.equal(
    response.jsonBody.checkoutUrl,
    "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-456",
  );
});
test("surfaces a generic error when Mercado Pago fails", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-secret";
  process.env.APP_BASE_URL = "http://localhost:5173";
  globalThis.fetch = async () =>
    Response.json({ message: "invalid credentials" }, { status: 401 });
  const response = await createPayment(post(validBody));
  assert.equal(response.status, 502);
  assert.equal(response.jsonBody.error.code, "PAYMENTS_ERROR");
});
