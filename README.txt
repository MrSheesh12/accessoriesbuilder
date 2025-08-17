Accessories Builder (v5 refactor)
===================================

Drop-in static app for Netlify/Vercel. No build step needed.

Highlights
----------
- Centered, properly sized logo in the sticky header.
- **Working finance toggle** that reveals a calculator and shows a live "$/mo" badge next to Total.
- Cleaner layout, responsive cards, category filter, and quick packages.
- Prices, tax, packages all live in one CONFIG in `js/app.js` for easy updates.
- Exports a `quote.json` file with selections and totals.

Tax & Prices
------------
- Tax is set to 8.9% in `CONFIG.taxRate`.
- Sample items use prices you provided (tint, bedliner, ReadyLIFT, etc.).
- You can add or edit items in `CONFIG.items`.

Images
------
- The code references your filenames:
  - 5541a666-cf50-4670-8af2-0ecc316ccbc8.png (logo)
  - 7a6f71e5-6692-47d5-ad75-b35514b60a8c.png (F-150 bug deflector)
  - 3c5fc9e4-d6ea-402d-827f-52fb12bfcf40.png (F-150 HD bug deflector)
  - a4cd8cfa-5d0e-48ab-84b6-da4437837d6a.png (Super Duty bug deflector)
  - ab3196d6-2aec-4652-82d8-d951d41320a3.png (Rain deflector)
  - b69bcb44-92b9-4844-8dd0-74d61a90b037.png (BAKFlip MX4)
  - retraxpro.png (Retrax PRO XR)
- Place your real image files into `/assets` with the same names to replace the placeholders.

Deploy
------
1) Upload the whole folder to Netlify (drag-and-drop) or serve locally.
2) Ensure the root contains `index.html`, `css/`, `js/`, and `assets/`.

Customizing
-----------
- Add categories by extending the `category` field on items and they will auto-populate the filter.
- Add bundles in `CONFIG.packages` mapping to item ids.



----
VIN/Stock Photo Lookup
----------------------
- Deployed as a Netlify Function at `/.netlify/functions/fetch-vehicle-media`.
- In the UI, enter **last 8 of VIN** or **Stock #**, click **Grab Photos**.
- The function scans the site's inventory sitemaps to find the vehicle page, then pulls DealerInspire-hosted image URLs for that VIN.
- Selected base photo is saved in the exported quote JSON.

Netlify Setup
-------------
1) Ensure your site is on Netlify.
2) Place the `netlify/functions/fetch-vehicle-media.js` file as included.
3) Netlify auto-exposes it at `/.netlify/functions/fetch-vehicle-media`.
4) No secrets or keys required.

