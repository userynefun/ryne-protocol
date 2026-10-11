# Ryne

A quiet board for the noisiest coins on Solana.

[![Live site](https://img.shields.io/badge/live-ryne.fun-111111?style=flat-square)](https://ryne.fun)
![Chain](https://img.shields.io/badge/chain-Solana-555555?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-999999?style=flat-square)

**Chain:** Solana  
**Contract address:** pending (will be published here and on the site once stated)

## Overview

Ryne follows the coins that carry a paid boost on Solana and ranks ten of them by 24-hour volume. Prices, liquidity and moves refresh on their own every sixty seconds, rest while the tab is hidden, and keep the last good reading if the source goes quiet.

The site is a static bundle with no server and no tracking.

## Features

- Live board of ten coins: logo, price, 24h change, volume, liquidity, per-row address copy
- Ticker, spotlight cards and count-up numbers driven by the same feed
- Skeleton loaders that fade into real data
- Exponential backoff when the source fails, with a dash and a plain error note
- A register of outside facts: anything not yet stated renders flat and unlinked
- Full `prefers-reduced-motion` support
- Achromatic design system, single tokens file

## Links

- Site: https://ryne.fun
- X: pending
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm run build   # writes dist/
npm run gates   # build checks, exits non-zero on any failure
npm run serve   # serves dist/ locally (PORT optional)
```

Deploy by uploading the `dist/` folder. Facts live in `register.json`; edit a record there and rebuild.

## License

MIT, see [LICENSE](LICENSE).
