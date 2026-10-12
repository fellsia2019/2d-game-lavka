export const NO_ADS_PRODUCT_ID = "disable_ads";

export interface IProduct {
  id: string;
  title: string;
  description: string;
  imageURI?: string;
  price: string;
  priceValue: string;
  priceCurrencyCode: string;
  getPriceCurrencyImage(size: "small" | "medium" | "svg"): string;
}

export interface IPurchase {
  productID: string;
  purchaseToken: string;
  developerPayload?: string;
}

export interface YandexPayments {
  getCatalog(): Promise<IProduct[]>;
  getPurchases(): Promise<IPurchase[]>;
  purchase(options: { id: string }): Promise<IPurchase>;
}

export interface YandexSDK {
  payments?: YandexPayments;
  getPayments?(): Promise<YandexPayments>;
  adv?: {
    hideBannerAdv?(): Promise<unknown> | unknown;
    showFullscreenAdv?(options: {
      callbacks: {
        onOpen: () => void;
        onClose: (wasShown?: boolean) => void;
        onError: (error?: unknown) => void;
      };
    }): void;
  };
  features?: {
    LoadingAPI?: { ready?(): void };
    GameplayAPI?: { start?(): void; stop?(): void };
  };
  on?(event: "game_api_pause" | "game_api_resume", callback: () => void): void;
  off?(event: "game_api_pause" | "game_api_resume", callback: () => void): void;
}

export interface NoAdsSnapshot {
  readonly status: "local" | "loading" | "ready" | "unavailable" | "error";
  readonly owned: boolean;
  readonly product: IProduct | null;
  readonly purchasing: boolean;
}

const READ_TIMEOUT_MS = 15_000;
const AD_TIMEOUT_MS = 120_000;

function bounded<T>(action: () => Promise<T> | T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SDK request timed out")), READ_TIMEOUT_MS);
    Promise.resolve().then(action).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validPurchase(value: unknown): value is IPurchase {
  return record(value) && nonempty(value.productID) && nonempty(value.purchaseToken);
}

function validPurchases(value: unknown): value is IPurchase[] {
  return Array.isArray(value) && value.every(validPurchase);
}

function validProduct(value: unknown): value is IProduct {
  return record(value) && value.id === NO_ADS_PRODUCT_ID && nonempty(value.title)
    && typeof value.description === "string" && nonempty(value.price)
    && nonempty(value.priceValue) && nonempty(value.priceCurrencyCode)
    && typeof value.getPriceCurrencyImage === "function";
}

function safely(callback?: () => void): void {
  try { callback?.(); } catch { /* UI callbacks cannot interrupt SDK cleanup. */ }
}

/** Platform ownership is separate from game progress. This permanent purchase is never consumed. */
export class NoAdsService {
  private state: NoAdsSnapshot = Object.freeze({ status: "local", owned: false, product: null, purchasing: false });
  private sdk: YandexSDK | null = null;
  private payments: YandexPayments | null = null;
  private connection = 0;
  private connecting: Promise<void> | null = null;
  private restoring: Promise<boolean> | null = null;
  private buying: Promise<boolean> | null = null;
  private advertising: Promise<boolean> | null = null;

  constructor(private readonly onChange?: () => void) {}

  get snapshot(): NoAdsSnapshot { return this.state; }

  private update(change: Partial<NoAdsSnapshot>): void {
    this.state = Object.freeze({ ...this.state, ...change });
    safely(this.onChange);
  }

  async connect(sdk: YandexSDK): Promise<void> {
    // Changing the SDK must not orphan an open payment window or allow another charge.
    if (this.buying) await this.buying;
    const connection = ++this.connection;
    this.sdk = sdk;
    this.payments = null;
    this.restoring = null;
    this.update({ status: "loading", owned: false, product: null, purchasing: false });
    const pending = this.initialize(sdk, connection);
    this.connecting = pending;
    await pending;
    if (this.connecting === pending) this.connecting = null;
  }

  private async initialize(sdk: YandexSDK, connection: number): Promise<void> {
    let payments: YandexPayments;
    try {
      // Default unsigned responses are handled on the client. Signed responses need a server.
      const available = await bounded(() => sdk.getPayments ? sdk.getPayments() : sdk.payments);
      if (!available || typeof available.getCatalog !== "function"
        || typeof available.getPurchases !== "function" || typeof available.purchase !== "function") throw new Error("Payments unavailable");
      payments = available;
    } catch {
      if (connection === this.connection) this.update({ status: "unavailable" });
      return;
    }
    if (connection !== this.connection) return;
    this.payments = payments;
    const [catalog, purchases] = await Promise.allSettled([
      bounded(() => payments.getCatalog()), bounded(() => payments.getPurchases()),
    ]);
    if (connection !== this.connection) return;
    const purchasesValid = purchases.status === "fulfilled" && validPurchases(purchases.value);
    const candidate = catalog.status === "fulfilled" && Array.isArray(catalog.value)
      ? catalog.value.find((product) => record(product) && product.id === NO_ADS_PRODUCT_ID) : undefined;
    const catalogValid = catalog.status === "fulfilled" && Array.isArray(catalog.value)
      && (candidate === undefined || validProduct(candidate));
    const owned = purchasesValid && purchases.status === "fulfilled"
      && purchases.value.some((purchase) => purchase.productID === NO_ADS_PRODUCT_ID);
    this.update({
      status: purchasesValid && catalogValid ? "ready" : "error",
      owned,
      product: validProduct(candidate) ? candidate : null,
    });
    if (owned) this.hideBanner();
  }

  async restore(): Promise<boolean> {
    if (this.buying) return this.buying;
    if (this.connecting) {
      await this.connecting;
      return this.state.owned;
    }
    if (this.restoring) return this.restoring;
    if (!this.payments) return false;
    const connection = this.connection, payments = this.payments;
    this.update({ status: "loading" });
    const pending = Promise.resolve().then(() => this.restoreFrom(payments, connection));
    this.restoring = pending;
    try { return await pending; }
    finally { if (this.restoring === pending) this.restoring = null; }
  }

  private async restoreFrom(payments: YandexPayments, connection: number): Promise<boolean> {
    try {
      const purchases = await bounded(() => payments.getPurchases());
      if (!validPurchases(purchases)) throw new Error("Invalid purchases response");
      if (connection !== this.connection) return false;
      const owned = purchases.some((purchase) => purchase.productID === NO_ADS_PRODUCT_ID);
      this.update({ status: "ready", owned });
      if (owned) this.hideBanner();
      return owned;
    } catch {
      // A failed request does not revoke previously confirmed ownership; ads stay blocked.
      if (connection === this.connection) this.update({ status: "error" });
      return false;
    }
  }

  async purchase(): Promise<boolean> {
    if (this.buying) return this.buying;
    if (!this.payments || this.state.status !== "ready" || !this.state.product
      || this.state.owned || this.state.purchasing || this.advertising) return false;
    const connection = this.connection, payments = this.payments;
    this.update({ purchasing: true });
    const pending = Promise.resolve().then(async () => {
      try {
        // Payment can take minutes while the player uses the platform window. Do not time it out.
        const receipt = await payments.purchase({ id: NO_ADS_PRODUCT_ID });
        if (connection !== this.connection) return false;
        if (!validPurchase(receipt) || receipt.productID !== NO_ADS_PRODUCT_ID) throw new Error("Invalid purchase receipt");
        this.update({ status: "ready", owned: true });
        this.hideBanner();
        return true;
      } catch {
        // A lost success response can look like cancellation. Check platform ownership once.
        return this.restoreFrom(payments, connection);
      }
    });
    this.buying = pending;
    try { return await pending; }
    finally {
      if (this.buying === pending) this.buying = null;
      if (connection === this.connection) this.update({ purchasing: false });
    }
  }

  private hideBanner(): void {
    const adv = this.sdk?.adv;
    if (typeof adv?.hideBannerAdv !== "function") return;
    // Best effort only: banner failures cannot remove the permanent entitlement.
    void bounded(() => adv.hideBannerAdv!()).catch(() => {});
  }

  canShowAdBreak(): boolean {
    return this.state.status === "ready" && !this.state.owned && !this.state.purchasing
      && !this.advertising && typeof this.sdk?.adv?.showFullscreenAdv === "function";
  }

  async showAdBreak(callbacks: { onOpen?: () => void; onClose?: () => void } = {}): Promise<boolean> {
    if (!this.canShowAdBreak()) return false;
    const adv = this.sdk!.adv!;
    let resolve!: (shown: boolean) => void;
    const pending = new Promise<boolean>((done) => { resolve = done; });
    this.advertising = pending;
    let finished = false, opened = false;
    const finish = (shown: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      safely(callbacks.onClose);
      if (this.advertising === pending) this.advertising = null;
      resolve(shown);
    };
    const timer = setTimeout(() => finish(false), AD_TIMEOUT_MS);
    try {
      adv.showFullscreenAdv!({ callbacks: {
        onOpen: () => {
          if (finished || opened) return;
          opened = true;
          safely(callbacks.onOpen);
        },
        onClose: (wasShown) => finish(typeof wasShown === "boolean" ? wasShown : opened),
        onError: () => finish(false),
      } });
    } catch { finish(false); }
    return pending;
  }
}
