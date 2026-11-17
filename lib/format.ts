export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  let minimumFractionDigits = 2;
  let maximumFractionDigits = 2;

  if (abs > 0 && abs < 0.01) {
    const digits = Math.min(10, Math.ceil(-Math.log10(abs)) + 2);
    minimumFractionDigits = Math.min(2, digits);
    maximumFractionDigits = digits;
  } else if (abs >= 0.01 && abs < 1) {
    maximumFractionDigits = 4;
  }

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

export function formatCompactUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export function formatSignedUsd(value: number): string {
  const formatted = formatUsd(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function formatPercent(value: number): string {
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function formatStamp(epochMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(epochMs));
}

export function formatBarTime(epochSec: number, withTime: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined,
    timeZoneName: withTime ? "short" : undefined,
  }).format(new Date(epochSec * 1000));
}

export function pricePrecision(price: number): number {
  const abs = Math.abs(price);
  if (abs >= 100) return 2;
  if (abs >= 1) return 2;
  if (abs >= 0.1) return 4;
  if (abs >= 0.01) return 5;
  if (abs >= 0.0001) return 6;
  return 8;
}

export function toneClass(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-up" : "text-down";
}
