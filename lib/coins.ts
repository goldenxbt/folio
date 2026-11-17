export const RANGES = [
  {
    id: "1D",
    label: "1D",
    krakenInterval: 15,
    coinbaseGranularity: 900,
    windowSec: 24 * 60 * 60,
    interval: "15-minute",
  },
  {
    id: "7D",
    label: "7D",
    krakenInterval: 60,
    coinbaseGranularity: 3600,
    windowSec: 7 * 24 * 60 * 60,
    interval: "1-hour",
  },
  {
    id: "1M",
    label: "1M",
    krakenInterval: 240,
    coinbaseGranularity: 21600,
    windowSec: 30 * 24 * 60 * 60,
    interval: "4-hour",
  },
  {
    id: "3M",
    label: "3M",
    krakenInterval: 1440,
    coinbaseGranularity: 86400,
    windowSec: 90 * 24 * 60 * 60,
    interval: "daily",
  },
  {
    id: "1Y",
    label: "1Y",
    krakenInterval: 1440,
    coinbaseGranularity: 86400,
    windowSec: 365 * 24 * 60 * 60,
    interval: "daily",
  },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];
export type RangeSpec = (typeof RANGES)[number];

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
const rangeById = new Map(RANGES.map((range) => [range.id, range]));

export function getCoin(id: string): Coin | null {
  return coinById.get(id) ?? null;
}

export function getRange(id: string): RangeSpec | null {
  return rangeById.get(id as RangeId) ?? null;
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
