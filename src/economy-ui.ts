import { icon } from "./icons";
import type { TaskCurrency } from "./campaign";

/** Keep wallet chips compact; accessible labels retain the full integer amount. */
export function compactAmount(value: number): string {
  const amount = Math.max(0, Math.trunc(value));
  if (amount < 1000) return String(amount);
  const unit = amount >= 1e12 ? [1e12, "t"] as const : amount >= 1e9 ? [1e9, "b"] as const
    : amount >= 1e6 ? [1e6, "m"] as const : [1e3, "k"] as const;
  const scaled = amount / unit[0];
  return `${scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled)}${unit[1]}`;
}
export const currencyLabel = (currency: TaskCurrency): string => currency === "repairKits" ? "ремкомплектов" : "звёзд";
export const currencyIcon = (currency: TaskCurrency): string =>
  icon(currency === "repairKits" ? "repair" : "star", currency === "repairKits" ? "currency-icon-repair" : "currency-icon-star");
