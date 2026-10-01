# LKA Invoices

An internal GST invoicing app for **Lingeshwar Kaparthi & Associates** (Siddipet, Telangana). Staff create
GST-compliant invoices, download them as branded PDFs, and send them by email or WhatsApp.

This README is the handover guide for whoever manages hosting and the domain. Sections 1–3 describe the app;
section 4 is the production setup checklist; section 5 covers day-to-day operations.

---

## 1. Architecture at a glance

| Piece | What it does | Where it runs |
|---|---|---|
| React single-page app (Vite + TypeScript + Tailwind) | All screens. **Generates PDFs in the browser** (`@react-pdf/renderer`) | Netlify (static hosting) |
| Firebase Authentication (email/password) | Sign-in. Roles come from a `role` custom claim (`ADMIN` / `STAFF`) | Firebase, **Spark (free) plan** |
| Cloud Firestore | Clients, invoices, settings, counters, audit log. Protected by `firestore.rules` | Firebase, **Spark (free) plan** |
| Netlify Functions (`netlify/functions/`) | Server-side code that needs secrets: user management (`admin-users`) and sending email (`send-invoice-email`) | Netlify |

**Spark plan only.** The app uses no Cloud Functions, no Cloud Storage and no managed backups. The logo is stored
as a small base64 image inside the settings document, and backups are a JSON download (section 5.3).

**Secrets.** The Firebase **web** config (`VITE_FIREBASE_*`) is public by design. The Firebase **Admin**
credentials and the **SMTP** password exist only as Netlify Function environment variables. Only
`.env.example` is committed.

### Data model (Firestore)

| Path | Contents | Who can write |
|---|---|---|
| `settings/firm` | Firm details, bank/UPI, GST rate, SAC list, invoice prefix, due days, brand colour, logo (data URL ≤ 300 KB) | ADMIN |
| `users/{uid}` | Profile mirror (email, name, role, disabled) for the Users page | Netlify Function only |
| `clients/{id}` | Name, contact, email, WhatsApp, address, state + GST state code, GSTIN, PAN | ADMIN, STAFF (no delete) |
| `invoices/{id}` | Client snapshot, line items, reimbursements, totals (**integer paise**), status, number, payment, cancellation | See rules below |
| `counters/{FY}` e.g. `counters/2026-27` | `{ last, lastInvoiceId }`, the last number used in that financial year | Only together with issuing an invoice |
| `auditLog/{id}` | Who did what to which invoice, with server timestamps | Append-only |

### Invoice rules (enforced by `firestore.rules`, not just the UI)

* **DRAFT → ISSUED**: the number (`LKA/2026-27/0001`, max 16 characters) is assigned only at issue time, in a
  Firestore **transaction** on the per-FY counter. The rules require the counter to move forward by exactly
  one in the same transaction, the number to match the counter, the FY to match today's Indian date, and the
  issuer and timestamp to be genuine. Numbers can't be skipped, reused or back-dated.
* **ISSUED → PAID** (ADMIN or STAFF): only `status`, `payment` (date, mode, amount, TDS, reference) and the
  "updated" stamp may change.
* **ISSUED → CANCELLED** (ADMIN only): needs a reason. The number stays reserved. To correct an invoice,
  cancel it and issue a new one.
* Anything else on an issued invoice is rejected, and nothing can be deleted.
* Tax: if the client's GST state code equals the firm's (Telangana, `36`), the invoice gets CGST + SGST at
  half the GST rate each; otherwise IGST at the full rate. Reimbursements are listed separately and carry
  no GST. The grand total is rounded to the nearest rupee and the round-off is shown.

---

## 2. Repository layout

```
firestore.rules            Security rules (default deny)
firestore.indexes.json     Composite indexes (deploy with the rules)
firebase.json              Rules/indexes paths + emulator ports
netlify.toml               Build, SPA redirect, functions config, security headers
netlify/functions/         admin-users.ts, send-invoice-email.ts, _shared/ (Admin SDK + auth checks)
scripts/                   create-admin.ts (first ADMIN), seed-emulator.ts (local demo data)
src/lib/                   Pure logic + unit tests: tax, amount in words, FY/numbering, money, CSV
src/data/                  Firestore reads/writes (invoices, clients, settings, audit)
src/pages/, src/components Screens
src/pdf/                   A4 invoice layout + PDF generation
tests/emulator/            Rules, concurrent numbering and function tests (Firebase Emulator)
```

---

## 3. Local development

**Prerequisites:** Node.js 22, Java 21 or newer (for the Firestore emulator). Nothing needs a global install;
everything runs through `npx`.

```bash
npm ci
cp .env.example .env        # already set up for the emulators (project id demo-lka-invoices)

# terminal 1 – Firebase Auth + Firestore emulators (data kept in ./.emulator-data)
npm run emulators

# terminal 2 – seed an ADMIN, firm settings and two sample clients
npm run seed:emulator       # → admin@example.com / admin12345

# terminal 3 – app + Netlify Functions on http://localhost:8888
npx netlify-cli dev
```

* Emulator UI (browse data and users): http://localhost:4000
* A yellow "Local emulator mode" bar appears whenever the app is talking to the emulators.
* **Email locally:** `.env` points SMTP at `127.0.0.1:1025`. Run any local mail catcher on that port, e.g.
  `docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`, then read the mail at http://localhost:8025.
* **If `netlify dev` can't start** (some corporate networks block the Edge Functions runtime download), run
  `npx netlify-cli functions:serve --port 9999` in one terminal and `npm run dev` in another, then open
  http://localhost:5173. Vite forwards `/.netlify/functions/*` to port 9999.

### Tests

```bash
npm test                 # unit tests: tax engine, amount in words, FY rollover, money, CSV
npm run test:emulator    # starts the emulators, then: security rules, concurrent numbering, functions
npm run test:all         # both
npm run typecheck
```

The emulator suite shows that:

* signed-out users and users without a role can't read or write anything;
* STAFF can't change settings, read other users' profiles, cancel invoices, edit issued invoices, tamper
  with counters, or forge or delete audit entries;
* 10 invoices issued at the same moment by different users get exactly `0001`–`0010`;
* the functions reject missing or invalid tokens and non-ADMIN callers, and email arrives with the PDF
  attached.

---

## 4. Production setup (one-time, for the hosting person)

> Work through these steps in order. Steps 4.1–4.4 are in the Firebase console, 4.5–4.7 in Netlify and DNS, and 4.8–4.9 finish the setup.

### 4.1 Create the Firebase project (stay on Spark)

1. https://console.firebase.google.com → **Add project** (e.g. `lka-invoices`). Google Analytics isn't needed.
2. Leave the billing plan on **Spark (no-cost)**. Never upgrade: nothing in this app needs Blaze.
3. **Project settings → General → Your apps → Web (`</>`)** → register an app (no Hosting). Copy `apiKey`,
   `authDomain`, `projectId` and `appId`; they become the `VITE_FIREBASE_*` variables in 4.5.

### 4.2 Authentication: enable Email/Password and disable sign-up

1. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave
   "Email link" off) → Save.
2. **Authentication → Settings → User actions** → **untick "Enable create (sign-up)"** (and untick "Enable
   deletion") → Save. This stops anyone creating an account with the public web config. Only ADMINs create
   users, through the app.
   * Defence in depth: even if an account were created some other way, it would have no `role` claim, and
     the security rules deny all data access to such accounts.

### 4.3 Create the Firestore database

**Build → Firestore Database → Create database** → *Standard edition*, location **asia-south1 (Mumbai)**,
start in **production mode**. The location can't be changed later.

### 4.4 Deploy the security rules and indexes

From a checkout of this repository:

```bash
npm ci
npx firebase login
npx firebase use --add            # pick the project, alias "prod"
npx firebase deploy --only firestore:rules,firestore:indexes
```

Index builds take a few minutes; watch them under **Firestore → Indexes**. Repeat this command whenever
`firestore.rules` or `firestore.indexes.json` changes.

### 4.5 Service account for Netlify Functions

1. **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**. This downloads a
   JSON file.
2. From the JSON copy **only** these three values into Netlify (4.6):
   `project_id` → `FIREBASE_PROJECT_ID`, `client_email` → `FIREBASE_CLIENT_EMAIL`,
   `private_key` → `FIREBASE_PRIVATE_KEY`.
3. **Delete the JSON file** afterwards. Don't email it or commit it. (Netlify limits the size of function
   environment variables, which is why we use three short variables instead of the whole file.)

### 4.6 Netlify site

1. Netlify → **Add new site → Import an existing project** → GitHub → `ca-invoice-app`.
   Base directory: *(empty)*. Build command and publish directory come from `netlify.toml`
   (`npm run build`, `dist`).
2. **Site configuration → Environment variables**, add:

| Variable | Scope | Value |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Builds | from 4.1 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Builds | from 4.1 (e.g. `lka-invoices.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Builds | from 4.1 |
| `VITE_FIREBASE_APP_ID` | Builds | from 4.1 |
| `FIREBASE_PROJECT_ID` | Functions | from 4.5 |
| `FIREBASE_CLIENT_EMAIL` | Functions | from 4.5 |
| `FIREBASE_PRIVATE_KEY` | Functions, mark **secret** | from 4.5. Paste the whole key including the `-----BEGIN/END PRIVATE KEY-----` lines; real line breaks or literal `\n` both work |
| `SMTP_HOST` | Functions | e.g. `smtp.gmail.com` (Google Workspace) or `smtp.zoho.in` |
| `SMTP_PORT` | Functions | `465` (or `587`) |
| `SMTP_SECURE` | Functions | `true` for 465, `false` for 587 |
| `SMTP_USER` | Functions | mailbox login, e.g. `accounts@calingeshwar.com` |
| `SMTP_PASS` | Functions, mark **secret** | mailbox password or **app password** (required by Gmail/Workspace when 2-step verification is on) |
| `MAIL_FROM` | Functions | `Lingeshwar Kaparthi & Associates <accounts@calingeshwar.com>`. Must be an address the SMTP account may send as |

   **Never** set `VITE_USE_FIREBASE_EMULATORS`, `FIREBASE_AUTH_EMULATOR_HOST` or `FIRESTORE_EMULATOR_HOST`
   in Netlify. They are for local development only.

3. **Deploys → Trigger deploy**. The `VITE_*` values are baked in at build time, so redeploy after changing them.

### 4.7 Custom domain + Firebase authorised domains

1. Netlify → **Domain management → Add a domain** → e.g. `invoices.calingeshwar.com`.
2. At the DNS provider for `calingeshwar.com` add: `CNAME  invoices  →  <your-site>.netlify.app`.
   Netlify issues the HTTPS certificate automatically (Let's Encrypt) once DNS resolves.
3. Firebase console → **Authentication → Settings → Authorized domains → Add domain** →
   `invoices.calingeshwar.com` (and `<your-site>.netlify.app` if staff will use that URL).
   **Sign-in fails with `auth/unauthorized-domain` until you do this.**
4. Optional: in Netlify, set the custom domain as primary so the `.netlify.app` URL redirects to it.

For email deliverability, make sure `calingeshwar.com` has SPF/DKIM set up for your mail provider (your
mail provider's admin console shows the records).

### 4.8 Create the first ADMIN (one time)

Run this on a trusted computer. It talks to the **live** project, so double-check the project id it prints.

```bash
# .env (local, never committed) — remove the emulator lines, add the 3 Admin values from 4.5:
#   FIREBASE_PROJECT_ID=...  FIREBASE_CLIENT_EMAIL=...  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
npm run create-admin -- --email lingeshwar@calingeshwar.com --password 'a-long-strong-password' --name 'Lingeshwar Kaparthi' --live
```

Without `--live` the script refuses to touch the real project. Afterwards, remove the Admin credentials from
the local `.env`.

### 4.9 First sign-in

1. Open `https://invoices.calingeshwar.com` and sign in as the ADMIN.
2. **Settings**: firm name, tagline and proprietor line (optional, printed under the name in the PDF header), address, phone, email, website, GSTIN, PAN, bank details, UPI ID, default terms,
   GST rate (18%), SAC codes, invoice prefix (`LKA`), payment due days, brand colour and logo → **Save**.
   Invoices can't be issued until settings are saved.
   * The default brand colour is `#1a3a5c` (navy). The blue on the firm's visiting card is `#0c629b`.
3. **Users → Add a user** for each staff member (role STAFF). Give them their initial password privately.

---

## 5. Operations

### 5.1 Users

* **Add / promote / disable / reset password:** ADMIN → **Users**. Disabling or changing a role signs that
  user out of existing sessions. An ADMIN can't disable or demote themselves, so the firm can't get locked out.
* Staff who forget their password: an ADMIN uses **Set password** and tells them the new one.
* Keep at least two ADMIN accounts.

### 5.2 Invoicing workflow

1. **Clients → New client** (state is required: it decides CGST+SGST vs IGST; GSTIN optional but validated).
2. **Invoices → New invoice** → add service lines (SAC from the settings list) and any reimbursements →
   **Save draft** or **Save & issue**.
3. On the issued invoice: **Download PDF**, **Email** (editable subject/body, PDF attached), **Share on
   WhatsApp**. On phones this opens the share sheet with the PDF; on desktop it downloads the PDF and opens
   `wa.me` for the client's number, so attach the PDF in the chat.
4. **Record payment** (date, mode, amount received, TDS) → PAID. ADMIN can **Cancel** with a reason.
5. Every create, edit, issue, payment, cancellation and send is listed under **Activity** on the invoice
   (Firestore `auditLog`).
6. Numbering restarts at `0001` automatically on 1 April (Indian time) for the new financial year.

### 5.3 Backups (do this weekly)

Firestore managed backups need the paid Blaze plan, so this app has its own export instead:

ADMIN → **Backup → Export all data** → downloads `lka-invoices-backup_YYYY-MM-DD.json` containing settings,
clients, invoices, invoice counters and the full audit log. Keep the files somewhere safe and private (they
contain client and bank data), e.g. an encrypted drive plus one off-site copy. Each export costs one
Firestore read per document. Restoring from a backup would need a developer to write the JSON back with the
Admin SDK.

### 5.4 Free-tier budget

| Limit (Spark / Netlify free) | How the app stays inside it |
|---|---|
| Firestore 50k reads / 20k writes per day | Lists are paginated (20 per page), client search is prefix-based, settings are read once per session, and the dashboard uses server-side `sum()` aggregations (≈1 read per 1,000 invoices) plus a 20-item overdue list |
| Firestore 1 GiB storage | Text only; the logo is capped at ~300 KB |
| Netlify Functions (125k calls / month free) | Called only for user management and sending email |
| Function request size (~6 MB) | PDFs are ~10–200 KB; the function rejects anything over 4 MB |

### 5.5 Updating the app

Push to the main branch and Netlify redeploys automatically. If the change touched `firestore.rules` or
`firestore.indexes.json`, also run `npx firebase deploy --only firestore:rules,firestore:indexes`.
Run `npm run test:all` before deploying rule changes.

### 5.6 Troubleshooting

| Symptom | Fix |
|---|---|
| `auth/unauthorized-domain` on sign-in | Add the domain in Firebase → Authentication → Settings → Authorized domains (4.7) |
| "No access" page after sign-in | The account has no role. ADMIN → Users → set a role, or run `create-admin` for the first ADMIN |
| "You do not have permission…" | The action isn't allowed for your role, or the data failed validation (e.g. bad GSTIN) |
| A query fails with "requires an index" | Run the index deploy in 4.4 and wait for the build to finish |
| Email: "mail server rejected the message" | Check the `SMTP_*` / `MAIL_FROM` variables (app password? correct port/secure pair?) and redeploy |
| Functions return 500 "Internal error" | Netlify → Logs → Functions. Usually missing `FIREBASE_*` variables or a mangled private key |
| Invoice issue fails with a date / FY error | The device clock is wrong. The issue date must match today's date in India |
