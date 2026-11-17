export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  rank: number | null;
};

export type MarketSource = "coingecko" | "kraken" | "coinbase";

export type QuotesResponse = {
  updatedAt: number;
  source: MarketSource;
  quotes: Quote[];
};

export type CandlesResponse = {
  coin: string;
  range: string;
  source: MarketSource;
  interval: string;
  candles: Candle[];
};
