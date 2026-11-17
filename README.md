# Folio

A light crypto price chart. The left rail lists the major coins. The main area is a candlestick chart in the style of a CoinDesk price page: a large last price, the move over the selected range, 24h high and low, volume, market cap, and range buttons for 1D, 7D, 1M, 3M, and 1Y.

Open up to four charts. Click a coin to change the selected chart. Use the plus control to open that coin in another chart. Switch any chart between candles and a line.

Each chart can also be a ratio. Set “Priced in” to another coin, or pick a preset such as BTC/ETH or ETH/HYPE. The candles are the base coin’s dollar price divided by the quote coin’s dollar price, so ETH/HYPE is how much HYPE one ETH buys. Volume stays on USD charts only.

Quotes come from CoinGecko. Candles come from Kraken, with Coinbase as a backup. No API key is required.

The open charts, the selected coin, each range, candle or line, and any ratio are saved in this browser. A refresh restores that layout. The light or dark theme is saved the same way. Use Dark in the header to switch.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on port 3847.

## Charts

Candlesticks are drawn with [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/). TradingView Lightweight Charts™ are used under the Apache License 2.0. TradingView is the product creator.
