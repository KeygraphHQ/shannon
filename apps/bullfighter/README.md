# Bullfighter

Bullfighter is a mobile-first installable web app prototype inspired by Kenya's bullfighting scene. Browse sample bull listings, view simulated share portfolios, explore championship events, and try the Bull Coin wallet.

## Run locally

From the repository root, serve the app over localhost:

```bash
python -m http.server 4173 --directory apps/bullfighter
```

Open [http://localhost:4173](http://localhost:4173). The app has no build step or runtime dependencies. On a supported mobile browser, use its install or add-to-home-screen action.

## Publish with GitHub Pages

The repository includes `.github/workflows/bullfighter-pages.yml`. To publish:

1. In the repository settings, open **Pages** and set the build and deployment source to **GitHub Actions**.
2. Merge the Bullfighter changes and workflow into `main`. The workflow deploys when `apps/bullfighter/` changes. You can also run **Deploy Bullfighter to GitHub Pages** from the Actions tab.
3. Open the site URL shown on the workflow run's `github-pages` deployment environment. For this repository, the expected project-site URL is `https://keygraphhq.github.io/shannon/`.

The site is a static frontend: it has no server, accounts, protected data store, or transaction processing. Do not treat demo listings, balances, returns, ticket availability, or checkout as live offers. Review image and brand permissions before making the site public; replace any media you do not have permission to publish.

## Prototype scope

Bull profiles, records, share prices, balances, returns, fixtures, and ticket prices are sample content. Share purchases and sales, wallet top-ups, and ticket checkout are simulated in the browser. The prototype does not connect to M-Pesa, issue tickets, process payments, or provide Bull Coin with real-world value. A production financial or ticketing service needs a secure backend and vetted service integrations; this static demo is not configured for those transactions.
