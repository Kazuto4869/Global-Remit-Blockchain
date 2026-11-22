export const SCALE = 10_000_000n;

export function toUnits(value) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, "0"));
}

export function parseAmount(value) {
  if (typeof value !== "string" || !/^[0-9]{1,13}(\.[0-9]{1,7})?$/.test(value)) return null;
  const units = toUnits(value);
  return units > 0n && units <= 9_223_372_036_854_775_807n ? units : null;
}

export function fromUnits(units) {
  return `${units / SCALE}.${String(units % SCALE).padStart(7, "0")}`;
}
