export const INTERVALS = [
  { id: "1m", label: "1m", krakenInterval: 1, coinbaseGranularity: 60, seconds: 60, name: "1-minute" },
  { id: "5m", label: "5m", krakenInterval: 5, coinbaseGranularity: 300, seconds: 300, name: "5-minute" },
  { id: "15m", label: "15m", krakenInterval: 15, coinbaseGranularity: 900, seconds: 900, name: "15-minute" },
  { id: "1H", label: "1H", krakenInterval: 60, coinbaseGranularity: 3600, seconds: 3_600, name: "1-hour" },
  { id: "4H", label: "4H", krakenInterval: 240, coinbaseGranularity: 3600, seconds: 14_400, name: "4-hour" },
  { id: "1D", label: "1D", krakenInterval: 1440, coinbaseGranularity: 86_400, seconds: 86_400, name: "daily" },
  { id: "1W", label: "1W", krakenInterval: 10080, coinbaseGranularity: 86_400, seconds: 604_800, name: "weekly" },
] as const;

export const SPANS = [
  { id: "1H", label: "1H", windowSec: 60 * 60 },
  { id: "4H", label: "4H", windowSec: 4 * 60 * 60 },
  { id: "12H", label: "12H", windowSec: 12 * 60 * 60 },
  { id: "1D", label: "1D", windowSec: 24 * 60 * 60 },
  { id: "7D", label: "7D", windowSec: 7 * 24 * 60 * 60 },
  { id: "1M", label: "1M", windowSec: 30 * 24 * 60 * 60 },
  { id: "3M", label: "3M", windowSec: 90 * 24 * 60 * 60 },
  { id: "6M", label: "6M", windowSec: 180 * 24 * 60 * 60 },
  { id: "1Y", label: "1Y", windowSec: 365 * 24 * 60 * 60 },
  { id: "5Y", label: "5Y", windowSec: 5 * 365 * 24 * 60 * 60 },
] as const;

export type IntervalId = (typeof INTERVALS)[number]["id"];
export type IntervalSpec = (typeof INTERVALS)[number];
export type SpanId = (typeof SPANS)[number]["id"];
export type SpanSpec = (typeof SPANS)[number];

const LEGACY_RANGE: Record<string, { interval: IntervalId; span: SpanId }> = {
  "1m": { interval: "1m", span: "12H" },
  "5m": { interval: "5m", span: "7D" },
  "15m": { interval: "15m", span: "7D" },
  "1H": { interval: "1H", span: "1M" },
  "4H": { interval: "4H", span: "3M" },
  "1D": { interval: "15m", span: "1D" },
  "7D": { interval: "1H", span: "7D" },
  "1M": { interval: "4H", span: "1M" },
  "3M": { interval: "1D", span: "3M" },
  "6M": { interval: "1D", span: "6M" },
  "1Y": { interval: "1D", span: "1Y" },
  "5Y": { interval: "1W", span: "5Y" },
};

export type Coin = {
  id: string;
  symbol: string;
  name: string;
  gecko: string;
  kraken: string;
  krakenKey: string;
  coinbase: string;
  aliases: readonly string[];
};

export const COINS: readonly Coin[] = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", gecko: "bitcoin", kraken: "XBTUSD", krakenKey: "XXBTZUSD", coinbase: "BTC-USD", aliases: [] },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", gecko: "ethereum", kraken: "ETHUSD", krakenKey: "XETHZUSD", coinbase: "ETH-USD", aliases: [] },
  { id: "binancecoin", symbol: "BNB", name: "BNB", gecko: "binancecoin", kraken: "BNBUSD", krakenKey: "BNBUSD", coinbase: "BNB-USD", aliases: ["binance"] },
  { id: "ripple", symbol: "XRP", name: "XRP", gecko: "ripple", kraken: "XRPUSD", krakenKey: "XXRPZUSD", coinbase: "XRP-USD", aliases: [] },
  { id: "solana", symbol: "SOL", name: "Solana", gecko: "solana", kraken: "SOLUSD", krakenKey: "SOLUSD", coinbase: "SOL-USD", aliases: [] },
  { id: "hyperliquid", symbol: "HYPE", name: "Hyperliquid", gecko: "hyperliquid", kraken: "HYPEUSD", krakenKey: "HYPEUSD", coinbase: "HYPE-USD", aliases: ["hype"] },
  { id: "tron", symbol: "TRX", name: "TRON", gecko: "tron", kraken: "TRXUSD", krakenKey: "TRXUSD", coinbase: "TRX-USD", aliases: [] },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", gecko: "dogecoin", kraken: "XDGUSD", krakenKey: "XDGUSD", coinbase: "DOGE-USD", aliases: [] },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", gecko: "chainlink", kraken: "LINKUSD", krakenKey: "LINKUSD", coinbase: "LINK-USD", aliases: [] },
  { id: "cardano", symbol: "ADA", name: "Cardano", gecko: "cardano", kraken: "ADAUSD", krakenKey: "ADAUSD", coinbase: "ADA-USD", aliases: [] },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash", gecko: "bitcoin-cash", kraken: "BCHUSD", krakenKey: "BCHUSD", coinbase: "BCH-USD", aliases: [] },
  { id: "near", symbol: "NEAR", name: "NEAR", gecko: "near", kraken: "NEARUSD", krakenKey: "NEARUSD", coinbase: "NEAR-USD", aliases: [] },
  { id: "litecoin", symbol: "LTC", name: "Litecoin", gecko: "litecoin", kraken: "LTCUSD", krakenKey: "XLTCZUSD", coinbase: "LTC-USD", aliases: [] },
  { id: "uniswap", symbol: "UNI", name: "Uniswap", gecko: "uniswap", kraken: "UNIUSD", krakenKey: "UNIUSD", coinbase: "UNI-USD", aliases: [] },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche", gecko: "avalanche-2", kraken: "AVAXUSD", krakenKey: "AVAXUSD", coinbase: "AVAX-USD", aliases: [] },
  { id: "the-open-network", symbol: "TON", name: "Toncoin", gecko: "the-open-network", kraken: "TONUSD", krakenKey: "TONUSD", coinbase: "TON-USD", aliases: ["gram", "ton"] },
  { id: "sui", symbol: "SUI", name: "Sui", gecko: "sui", kraken: "SUIUSD", krakenKey: "SUIUSD", coinbase: "SUI-USD", aliases: [] },
  { id: "shiba-inu", symbol: "SHIB", name: "Shiba Inu", gecko: "shiba-inu", kraken: "SHIBUSD", krakenKey: "SHIBUSD", coinbase: "SHIB-USD", aliases: [] },
  { id: "pepe", symbol: "PEPE", name: "Pepe", gecko: "pepe", kraken: "PEPEUSD", krakenKey: "PEPEUSD", coinbase: "PEPE-USD", aliases: [] },
  { id: "polkadot", symbol: "DOT", name: "Polkadot", gecko: "polkadot", kraken: "DOTUSD", krakenKey: "DOTUSD", coinbase: "DOT-USD", aliases: [] },
  { id: "aptos", symbol: "APT", name: "Aptos", gecko: "aptos", kraken: "APTUSD", krakenKey: "APTUSD", coinbase: "APT-USD", aliases: [] },
];

const coinById = new Map(COINS.map((coin) => [coin.id, coin]));
const intervalById = new Map(INTERVALS.map((interval) => [interval.id, interval]));
const spanById = new Map(SPANS.map((span) => [span.id, span]));

export function getCoin(id: string): Coin | null {
  return coinById.get(id) ?? null;
}

export function getInterval(id: string): IntervalSpec | null {
  return intervalById.get(id as IntervalId) ?? null;
}

export function getSpan(id: string): SpanSpec | null {
  return spanById.get(id as SpanId) ?? null;
}

export function legacyRange(id: string): { interval: IntervalId; span: SpanId } | null {
  return LEGACY_RANGE[id] ?? null;
}

export function intervalShowsClock(id: string): boolean {
  const interval = getInterval(id);
  return interval != null && interval.seconds < 24 * 60 * 60;
}

export const RATIO_PRESETS = [
  { baseId: "bitcoin", quoteId: "ethereum" },
  { baseId: "ethereum", quoteId: "bitcoin" },
  { baseId: "ethereum", quoteId: "hyperliquid" },
  { baseId: "bitcoin", quoteId: "hyperliquid" },
  { baseId: "solana", quoteId: "ethereum" },
  { baseId: "ethereum", quoteId: "solana" },
] as const;

export function filterCoins(query: string): Coin[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return COINS.slice();
  return COINS.filter((coin) => {
    if (coin.symbol.toLowerCase().includes(needle)) return true;
    if (coin.name.toLowerCase().includes(needle)) return true;
    return coin.aliases.some((alias) => alias.includes(needle));
  });
}
