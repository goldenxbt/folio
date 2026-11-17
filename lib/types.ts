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
  tradedAt?: number;
};

export type MarketSource = "coingecko" | "kraken" | "coinbase";

export type QuotesResponse = {
  updatedAt: number;
  source: MarketSource;
  quotes: Quote[];
};

export type CandlesResponse = {
  coin: string;
  interval: string;
  intervalId: string;
  span: string | null;
  versus: string | null;
  source: MarketSource;
  candles: Candle[];
};
