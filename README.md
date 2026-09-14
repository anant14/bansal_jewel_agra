# Bansal Jewellers — dynamic website

A server-rendered Node.js site for **Bansal Jewellers, Agra** (Since 1820).
Visually it mirrors the shared design: dark heritage-luxury theme, gold gradient
accents, Cormorant Garamond + Inter type, reveal-on-scroll, hero slideshow.

It is built **dynamic first** so content is data-driven and every "enquire"
action is captured server-side — ready to plug straight into the **Meta WhatsApp
Cloud API** when you have your developer credentials.

---

## Stack

| Layer      | Choice                                             |
|------------|----------------------------------------------------|
| Server     | Node.js + Express                                  |
| Views      | EJS server-side templates (`views/`)               |
| Styling    | Handwritten CSS (`public/css/styles.css`), no framework |
| Client JS  | Vanilla (`public/js/main.js`), no build step       |
| Content    | JSON files in `data/` via a swappable service layer |
| Security   | helmet (CSP), compression, morgan logs             |
| WhatsApp   | `src/services/whatsapp.js` — Cloud API + webhook   |

No bundler, no database, no framework — `git clone`, `npm install`, `npm start`.

---

## Quick start

```bash
npm install
cp .env.example .env      # optional — site runs without it
npm run dev               # http://localhost:4000  (auto-reload)
# or
npm start
```

| URL | What |
|-----|------|
| `/` | The website |
| `/healthz` | Health check JSON |
| `/api/products` · `/api/products/:sku` | Catalogue as JSON (`?category=gold\|diamond\|polki`) |
| `/api/reviews` | Reviews + average rating |
| `/api/enquiries` (POST) | Enquiry intake (used by the on-page forms) |
| `/whatsapp/webhook` | Meta webhook (GET verify + POST events) |
| `/whatsapp/status` | Integration status JSON |

---

## Editing content

All copy and data lives in `data/` — edit the JSON and refresh (files are
hot-reloaded in development):

| File | Holds |
|------|-------|
| `data/brand.json` | Name, phone, address, hours, GSTIN, BIS licence, links |
| `data/content.json` | Every section's copy + nav, hero slides, USPs, timeline, wholesale, footer, WhatsApp quick replies |
| `data/products.json` | The catalogue (id, sku, category, name, specs, craft, image, description) |
| `data/reviews.json` | Testimonials |

`data/enquiries.json` and `data/whatsapp-inbox.json` are created at runtime and
git-ignored — they are the captured leads / inbound messages.

Product and showroom images currently point at Unsplash. Drop your own photos
into `public/assets/` and change the `image` / `src` values to `/assets/....`.

---

## How enquiries flow (today, without WhatsApp API)

1. Every "Enquire" / "WhatsApp Us" / CTA is a real `wa.me` deep link.
2. With JavaScript on, the click opens an **enquiry form** instead.
3. The form `POST`s to `/api/enquiries` → the lead is validated and appended to
   `data/enquiries.json`.
4. The response returns a pre-filled `wa.me` URL, shown as a **"Continue on
   WhatsApp"** button so nothing is lost.
5. `whatsapp.notifyBusiness()` is called — a no-op until the API is configured.

So you capture leads now, and the same code path sends real WhatsApp messages
the moment you add credentials.

---

## Wiring up the Meta WhatsApp Cloud API (later)

1. Create an app at <https://developers.facebook.com/apps> → add **WhatsApp**.
2. Fill these in `.env`:

   ```
   WHATSAPP_TOKEN=<permanent system-user token>
   WHATSAPP_PHONE_NUMBER_ID=<from WhatsApp > API Setup>
   WHATSAPP_BUSINESS_ACCOUNT_ID=<WABA id>
   WHATSAPP_VERIFY_TOKEN=<any string you choose>
   WHATSAPP_APP_SECRET=<App settings > Basic>
   WHATSAPP_NOTIFY_TO=918826481301      # where new-lead alerts go
   ```

3. In **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://your-domain/whatsapp/webhook`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
4. Restart. `GET /whatsapp/status` should show `"configured": true`.

What turns on automatically:
- New website enquiries are pushed to `WHATSAPP_NOTIFY_TO` as a formatted message.
- Inbound customer messages hit `POST /whatsapp/webhook`, are stored in
  `data/whatsapp-inbox.json`, and (if `WHATSAPP_AUTO_REPLY=true`) get an
  acknowledgement reply.

Outbound helpers already available in `src/services/whatsapp.js`:
`sendText()`, `sendTemplate()`, `markRead()`, `notifyBusiness()`.

> Note: to message a customer *outside* the 24-hour service window you must use
> an approved **template** (`sendTemplate`). Free-form `sendText` only works
> within 24h of their last message.

---

## Deploying

```bash
npm ci --omit=dev
NODE_ENV=production PORT=4000 node server.js
# or with pm2:
pm2 start ecosystem.config.js
```

Put it behind Nginx/Caddy for TLS and proxy `/` → `127.0.0.1:4000`.
The webhook must be HTTPS and publicly reachable for Meta.

---

## Project layout

```
bansal jewellerys/
├── server.js                 # entry — starts the HTTP server
├── ecosystem.config.js       # pm2
├── data/                     # all content (JSON) + runtime leads
├── public/                   # css, js, favicon, (your images)
├── views/                    # index.ejs + partials/*.ejs + 404.ejs
└── src/
    ├── app.js                # express app, middleware, CSP, routes
    ├── config.js             # env → config
    ├── routes/
    │   ├── pages.js          # GET /  + /healthz
    │   ├── api.js            # /api/* content + enquiry intake
    │   └── whatsapp.js       # /whatsapp/webhook + /status
    ├── services/
    │   ├── content.js        # loads data/, builds the view model, wa.me links
    │   ├── whatsapp.js       # Meta Cloud API client + webhook helpers
    │   └── enquiryStore.js   # file-backed lead log (swap for a DB later)
    └── utils/logger.js
```
