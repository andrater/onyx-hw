export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function centsPrice(cents: number): string {
  return `${Math.round(cents)}¢`;
}
