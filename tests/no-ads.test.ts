import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_ADS_PRODUCT_ID, NoAdsService,
  type IProduct, type IPurchase, type YandexPayments, type YandexSDK,
} from "../src/no-ads";

const product: IProduct = {
  id: NO_ADS_PRODUCT_ID,
  title: "Без рекламных пауз внутри игры",
  description: "Одна постоянная покупка",
  price: "49 TST",
  priceValue: "49",
  priceCurrencyCode: "TST",
  getPriceCurrencyImage: (size) => `https://example.test/currency-${size}.png`,
};
const receipt: IPurchase = { productID: NO_ADS_PRODUCT_ID, purchaseToken: "opaque-platform-receipt" };
type AdCallbacks = Parameters<NonNullable<NonNullable<YandexSDK["adv"]>["showFullscreenAdv"]>>[0]["callbacks"];

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function mockSDK(options: {
  catalog?: () => Promise<IProduct[]>;
  purchases?: () => Promise<IPurchase[]>;
  buy?: (id: string) => Promise<IPurchase>;
  hide?: () => Promise<unknown>;
  show?: (callbacks: AdCallbacks) => void;
} = {}) {
  const calls = { catalog: 0, purchases: 0, buy: [] as string[], hide: 0, show: 0, consume: 0 };
  let adCallbacks: AdCallbacks | undefined;
  const payments: YandexPayments & { consumePurchase(token: string): Promise<void> } = {
    async getCatalog() { calls.catalog++; return options.catalog ? options.catalog() : [product]; },
    async getPurchases() { calls.purchases++; return options.purchases ? options.purchases() : []; },
    async purchase({ id }) { calls.buy.push(id); return options.buy ? options.buy(id) : receipt; },
    async consumePurchase() { calls.consume++; throw new Error("Permanent purchases must not be consumed"); },
  };
  const sdk: YandexSDK = {
    async getPayments() { return payments; },
    adv: {
      async hideBannerAdv() { calls.hide++; return options.hide?.(); },
      showFullscreenAdv({ callbacks }) { calls.show++; adCallbacks = callbacks; options.show?.(callbacks); },
    },
  };
  return { sdk, payments, calls, get adCallbacks() { return adCallbacks; } };
}

async function flush() { for (let step = 0; step < 8; step++) await Promise.resolve(); }

test("Local and unknown SDK states cannot offer purchases or call ads", async () => {
  const service = new NoAdsService();
  assert.deepEqual(service.snapshot, { status: "local", owned: false, product: null, purchasing: false });
  assert.equal(Object.isFrozen(service.snapshot), true);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.purchase(), false);
  assert.equal(await service.restore(), false);
  assert.equal(await service.showAdBreak(), false);
  await service.connect({});
  assert.equal(service.snapshot.status, "unavailable");
  assert.equal(service.canShowAdBreak(), false);
});

test("The exact platform product and currency are used without a fabricated offer", async () => {
  const mock = mockSDK(), service = new NoAdsService();
  await service.connect(mock.sdk);
  assert.equal(service.snapshot.status, "ready");
  assert.equal(service.snapshot.product, product);
  assert.equal(service.snapshot.owned, false);
  assert.equal(service.canShowAdBreak(), true);
  assert.equal(mock.calls.catalog, 1);
  assert.equal(mock.calls.purchases, 1);
  assert.deepEqual(mock.calls.buy, []);
  assert.equal(mock.calls.hide, 0);
});

test("The SDK direct payments interface is supported", async () => {
  const mock = mockSDK(), service = new NoAdsService();
  await service.connect({ ...mock.sdk, getPayments: undefined, payments: mock.payments });
  assert.equal(service.snapshot.status, "ready");
  assert.equal(service.snapshot.product, product);
});

test("Fresh service instances restore the same permanent ownership from the platform", async () => {
  const mock = mockSDK({ purchases: async () => [receipt] });
  for (let device = 0; device < 2; device++) {
    const service = new NoAdsService();
    await service.connect(mock.sdk);
    assert.equal(service.snapshot.owned, true);
    assert.equal(await service.purchase(), false);
    assert.equal(service.canShowAdBreak(), false);
    assert.equal(await service.showAdBreak(), false);
  }
  assert.equal(mock.calls.purchases, 2);
  assert.equal(mock.calls.hide, 2);
  assert.equal(mock.calls.show, 0);
  assert.equal(mock.calls.consume, 0);
  assert.deepEqual(mock.calls.buy, []);
});

test("One confirmed purchase blocks duplicate payment and every subsequent ad break", async () => {
  const payment = deferred<IPurchase>();
  const mock = mockSDK({ buy: () => payment.promise }), service = new NoAdsService();
  await service.connect(mock.sdk);
  const first = service.purchase(), duplicate = service.purchase(), restore = service.restore();
  await flush();
  assert.equal(service.snapshot.purchasing, true);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.showAdBreak(), false);
  assert.deepEqual(mock.calls.buy, [NO_ADS_PRODUCT_ID]);
  payment.resolve(receipt);
  assert.deepEqual(await Promise.all([first, duplicate, restore]), [true, true, true]);
  assert.equal(service.snapshot.owned, true);
  assert.equal(service.snapshot.purchasing, false);
  assert.equal(mock.calls.hide, 1);
  assert.equal(mock.calls.purchases, 1);
  assert.equal(mock.calls.consume, 0);
  assert.equal(await service.purchase(), false);
  assert.equal(await service.showAdBreak(), false);
  assert.equal(mock.calls.show, 0);
});

test("Canceled payment checks purchases once and grants no entitlement or other benefit", async () => {
  const mock = mockSDK({ buy: async () => { throw new Error("Canceled"); } }), service = new NoAdsService();
  await service.connect(mock.sdk);
  assert.equal(await service.purchase(), false);
  assert.equal(mock.calls.purchases, 2);
  assert.deepEqual(mock.calls.buy, [NO_ADS_PRODUCT_ID]);
  assert.equal(service.snapshot.owned, false);
  assert.equal(service.snapshot.purchasing, false);
  assert.equal(mock.calls.hide, 0);
  assert.equal(mock.calls.consume, 0);
});

test("Lost successful payment response recovers ownership without charging again", async () => {
  let purchased = false;
  const mock = mockSDK({
    purchases: async () => purchased ? [receipt] : [],
    buy: async () => { purchased = true; throw new Error("Connection lost"); },
  }), service = new NoAdsService();
  await service.connect(mock.sdk);
  assert.equal(await service.purchase(), true);
  assert.equal(service.snapshot.owned, true);
  assert.equal(mock.calls.purchases, 2);
  assert.deepEqual(mock.calls.buy, [NO_ADS_PRODUCT_ID]);
  assert.equal(mock.calls.hide, 1);
  assert.equal(mock.calls.consume, 0);
});

test("Malformed and unrelated payment receipts cannot grant this purchase", async () => {
  for (const invalid of [
    { productID: NO_ADS_PRODUCT_ID, purchaseToken: "" },
    { productID: "another-product", purchaseToken: receipt.purchaseToken },
    { signature: "signed-responses-require-a-server" },
    null,
  ]) {
    const mock = mockSDK({ buy: async () => invalid as IPurchase }), service = new NoAdsService();
    await service.connect(mock.sdk);
    assert.equal(await service.purchase(), false);
    assert.equal(service.snapshot.owned, false);
    assert.equal(mock.calls.purchases, 2);
    assert.equal(mock.calls.hide, 0);
    assert.equal(mock.calls.consume, 0);
  }
});

test("No catalog product means no purchase; permanent ownership still restores", async () => {
  for (const owned of [false, true]) {
    const mock = mockSDK({ catalog: async () => [], purchases: async () => owned ? [receipt] : [] });
    const service = new NoAdsService();
    await service.connect(mock.sdk);
    assert.equal(service.snapshot.status, "ready");
    assert.equal(service.snapshot.product, null);
    assert.equal(service.snapshot.owned, owned);
    assert.equal(await service.purchase(), false);
    assert.equal(await service.restore(), owned);
    assert.deepEqual(mock.calls.buy, []);
    assert.equal(mock.calls.hide, owned ? 2 : 0);
    assert.equal(mock.calls.consume, 0);
  }
});

test("Catalog failure and malformed product fail safely without granting or pricing a fake offer", async () => {
  for (const catalog of [
    async (): Promise<IProduct[]> => { throw new Error("Catalog unavailable"); },
    async () => [{ ...product, priceCurrencyCode: "" }],
    async () => ({ signature: "unsupported" }) as unknown as IProduct[],
  ]) {
    const mock = mockSDK({ catalog }), service = new NoAdsService();
    await service.connect(mock.sdk);
    assert.equal(service.snapshot.status, "error");
    assert.equal(service.snapshot.product, null);
    assert.equal(service.snapshot.owned, false);
    assert.equal(service.canShowAdBreak(), false);
    assert.equal(await service.purchase(), false);
    assert.deepEqual(mock.calls.buy, []);
    assert.equal(mock.calls.hide, 0);
  }
});

test("Restore joining initialization recognizes verified ownership despite a catalog failure", async () => {
  const catalog = deferred<IProduct[]>();
  const mock = mockSDK({ catalog: () => catalog.promise, purchases: async () => [receipt] });
  const service = new NoAdsService(), connecting = service.connect(mock.sdk);
  const restoring = service.restore();
  catalog.reject(new Error("Catalog unavailable"));
  await connecting;
  assert.equal(await restoring, true);
  assert.equal(service.snapshot.status, "error");
  assert.equal(service.snapshot.owned, true);
  assert.equal(service.snapshot.product, null);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(mock.calls.purchases, 1);
  assert.equal(mock.calls.hide, 1);
});

test("Unavailable payments and failed ownership lookup keep advertisements blocked", async () => {
  const service = new NoAdsService();
  await service.connect({ getPayments: async () => { throw new Error("Payments unavailable"); } });
  assert.equal(service.snapshot.status, "unavailable");
  assert.equal(service.canShowAdBreak(), false);
  const mock = mockSDK({ purchases: async () => { throw new Error("Purchase lookup unavailable"); } });
  await service.connect(mock.sdk);
  assert.equal(service.snapshot.status, "error");
  assert.equal(service.snapshot.owned, false);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.purchase(), false);
  assert.equal(await service.showAdBreak(), false);
  assert.equal(await service.restore(), false);
  assert.equal(mock.calls.hide, 0);
  assert.equal(mock.calls.show, 0);
});

test("Malformed purchase lists and signed responses do not count as verified ownership", async () => {
  for (const purchases of [
    [receipt, { productID: "broken", purchaseToken: "" }],
    [{ productID: NO_ADS_PRODUCT_ID }],
    { signature: "signed-responses-require-a-server" },
    null,
  ]) {
    const mock = mockSDK({ purchases: async () => purchases as IPurchase[] }), service = new NoAdsService();
    await service.connect(mock.sdk);
    assert.equal(service.snapshot.status, "error");
    assert.equal(service.snapshot.owned, false);
    assert.equal(service.canShowAdBreak(), false);
    assert.equal(mock.calls.hide, 0);
  }
});

test("Banner failure and later restore failure cannot revoke a confirmed permanent purchase", async () => {
  let failRestore = false;
  const mock = mockSDK({
    purchases: async () => { if (failRestore) throw new Error("Offline"); return [receipt]; },
    hide: async () => { throw new Error("Banner unavailable"); },
  }), service = new NoAdsService();
  await service.connect(mock.sdk);
  assert.equal(service.snapshot.owned, true);
  failRestore = true;
  assert.equal(await service.restore(), false);
  assert.equal(service.snapshot.status, "error");
  assert.equal(service.snapshot.owned, true);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.showAdBreak(), false);
  assert.equal(mock.calls.hide, 1);
  assert.equal(mock.calls.show, 0);
});

test("Failed post-payment restore does not grant ownership and blocks advertisement permission", async () => {
  let checks = 0;
  const mock = mockSDK({
    purchases: async () => { if (checks++) throw new Error("Offline"); return []; },
    buy: async () => { throw new Error("Payment failed"); },
  }), service = new NoAdsService();
  await service.connect(mock.sdk);
  assert.equal(await service.purchase(), false);
  assert.equal(service.snapshot.status, "error");
  assert.equal(service.snapshot.owned, false);
  assert.equal(service.snapshot.purchasing, false);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(mock.calls.hide, 0);
  assert.equal(checks, 2);
});

test("Restore requests are coalesced and block ads until platform ownership is known", async () => {
  let response: Promise<IPurchase[]> = Promise.resolve([]);
  const mock = mockSDK({ purchases: () => response }), service = new NoAdsService();
  await service.connect(mock.sdk);
  const waiting = deferred<IPurchase[]>(); response = waiting.promise;
  const first = service.restore(), duplicate = service.restore();
  await flush();
  assert.equal(service.snapshot.status, "loading");
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.purchase(), false);
  assert.equal(mock.calls.purchases, 2);
  waiting.resolve([receipt]);
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true]);
  assert.equal(service.snapshot.owned, true);
  assert.equal(mock.calls.hide, 1);
});

test("A stale SDK connection cannot overwrite newer platform ownership", async () => {
  const oldPurchases = deferred<IPurchase[]>(), old = mockSDK({ purchases: () => oldPurchases.promise });
  const current = mockSDK({ purchases: async () => [receipt] }), service = new NoAdsService();
  const staleConnection = service.connect(old.sdk);
  await flush();
  await service.connect(current.sdk);
  oldPurchases.resolve([]);
  await staleConnection;
  assert.equal(service.snapshot.owned, true);
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(old.calls.hide, 0);
  assert.equal(current.calls.hide, 1);
});

test("SDK read timeout keeps unverified ownership and ads blocked", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const mock = mockSDK({ purchases: () => new Promise(() => {}) }), service = new NoAdsService();
  const connecting = service.connect(mock.sdk);
  await flush();
  assert.equal(service.snapshot.status, "loading");
  assert.equal(service.canShowAdBreak(), false);
  t.mock.timers.tick(15_000);
  await connecting;
  assert.equal(service.snapshot.status, "error");
  assert.equal(service.snapshot.owned, false);
  assert.equal(service.canShowAdBreak(), false);
});

test("Payment itself stays pending beyond read and advertisement watchdog timeouts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const payment = deferred<IPurchase>();
  const mock = mockSDK({ buy: () => payment.promise }), service = new NoAdsService();
  await service.connect(mock.sdk);
  const buying = service.purchase();
  await flush();
  t.mock.timers.tick(300_000);
  await flush();
  assert.equal(service.snapshot.purchasing, true);
  assert.equal(service.snapshot.owned, false);
  assert.equal(service.canShowAdBreak(), false);
  assert.deepEqual(mock.calls.buy, [NO_ADS_PRODUCT_ID]);
  payment.resolve(receipt);
  assert.equal(await buying, true);
  assert.equal(service.snapshot.owned, true);
});

test("Ad callbacks and repeated SDK completion finish once even when UI callbacks throw", async () => {
  const mock = mockSDK(), service = new NoAdsService(() => { throw new Error("UI rendering failed"); });
  await service.connect(mock.sdk);
  let opens = 0, closes = 0;
  const ad = service.showAdBreak({
    onOpen: () => { opens++; throw new Error("UI open failed"); },
    onClose: () => { closes++; throw new Error("UI close failed"); },
  });
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.showAdBreak(), false);
  assert.equal(await service.purchase(), false);
  mock.adCallbacks!.onOpen(); mock.adCallbacks!.onOpen();
  mock.adCallbacks!.onClose(true); mock.adCallbacks!.onError(new Error("Late error"));
  mock.adCallbacks!.onClose(true); mock.adCallbacks!.onOpen();
  assert.equal(await ad, true);
  assert.equal(opens, 1);
  assert.equal(closes, 1);
  assert.equal(mock.calls.show, 1);
  assert.equal(service.canShowAdBreak(), true);
});

test("SDK synchronous errors and ad unavailability always release the ad guard", async () => {
  for (const show of [
    () => { throw new Error("Ad SDK failed"); },
    (callbacks: AdCallbacks) => callbacks.onError(new Error("No ad available")),
    (callbacks: AdCallbacks) => callbacks.onClose(false),
  ]) {
    const mock = mockSDK({ show }), service = new NoAdsService();
    await service.connect(mock.sdk);
    let closed = 0;
    assert.equal(await service.showAdBreak({ onClose: () => closed++ }), false);
    assert.equal(closed, 1);
    assert.equal(service.canShowAdBreak(), true);
  }
});

test("An ad missing SDK completion has a bounded watchdog and ignores late callbacks", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const mock = mockSDK(), service = new NoAdsService();
  await service.connect(mock.sdk);
  let closed = 0, opened = 0;
  const ad = service.showAdBreak({ onClose: () => closed++, onOpen: () => opened++ });
  t.mock.timers.tick(120_000);
  assert.equal(await ad, false);
  mock.adCallbacks!.onClose(true); mock.adCallbacks!.onOpen();
  assert.equal(closed, 1);
  assert.equal(opened, 0);
  assert.equal(service.canShowAdBreak(), true);
});

test("A SDK without fullscreen advertisements cannot report ad permission", async () => {
  const mock = mockSDK(), service = new NoAdsService();
  await service.connect({ getPayments: mock.sdk.getPayments });
  assert.equal(service.snapshot.status, "ready");
  assert.equal(service.canShowAdBreak(), false);
  assert.equal(await service.showAdBreak(), false);
  assert.equal(mock.calls.show, 0);
});
