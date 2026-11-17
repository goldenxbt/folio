# Folio

A light crypto price chart. The left rail lists the major coins. The main area is a candlestick chart in the style of a CoinDesk price page: a large last price, the move over the selected span, 24h high and low, volume, and market cap. Span sets how much of the chart is on screen (1H through 5Y). Candle sets the size of each bar (1m, 5m, 15m, 1H, 4H, 1D, 1W). A chart opens on 1-minute candles across 1 hour, so the first load stays small. Zoom out and older candles load into the empty space. When the candle and span options run past the edge, the arrows at either end of that row move through the rest, and the wheel does the same while the pointer is over them.

Open up to four charts. Click a coin to change the selected chart. Use the plus control to open that coin in another chart. A dollar chart or a pair can only be open once, so the plus control is disabled for a coin already on screen, and choosing a pair that is already open jumps to that chart. Switch any chart between candles and a line.

Each chart can also be a ratio. Set “Priced in” to another coin, or pick a preset such as BTC/ETH or ETH/HYPE. The candles are the base coin’s dollar price divided by the quote coin’s dollar price, so ETH/HYPE is how much HYPE one ETH buys. Volume stays on USD charts only.

Quotes start from CoinGecko, then each trade from Kraken moves the last price and the current candle. Candle history comes from Kraken, and older bars come from Coinbase when you zoom past what Kraken returns. No API key is required.

Drag the bar at the bottom of a chart to change the height of every panel at once. One or two charts start as tall as the screen. Three or four start at half that height, and their 24h figures sit beside the price so the candle area stays tall. Double-click the bar to return them to that size.

The open charts, the selected coin, each span and candle size, candle or line, any ratio, each panel height, and whether the market list is hidden are saved in this browser. A refresh restores that layout. The light or dark theme is saved the same way. Use Dark in the header to switch, and Hide to collapse the market list. A small icon at the corner of the chart opens it again.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on port 3847.

## Charts

Candlesticks are drawn with [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/). TradingView Lightweight Charts™ are used under the Apache License 2.0. TradingView is the product creator.
