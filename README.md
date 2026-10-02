# LKA Invoices

An internal GST invoicing app for **Lingesh K & Associates** (Siddipet, Telangana). Staff create
GST-compliant invoices, download them as branded PDFs, and send them by email or WhatsApp.

Plain-language guides (PDF):
- [`docs/LKA-Invoices-System-Architecture.pdf`](docs/LKA-Invoices-System-Architecture.pdf): architecture, data flow, security, privacy, maintenance and troubleshooting
- [`docs/LKA-Invoices-Users-Admin-Guide.pdf`](docs/LKA-Invoices-Users-Admin-Guide.pdf): managing admins and users (portal and Firebase console) and portal limits

This README is the handover guide for whoever manages hosting and the domain. Sections 1–3 describe the app;
section 4 is the production setup checklist; section 5 covers day-to-day operations.

---

## 1. Architecture at a glance

| Piece | What it does | Where it runs |
|---|---|---|
| React single-page app (Vite + TypeScript + Tailwind) | All screens. **Generates PDFs in the browser** (`@react-pdf/renderer`) | Netlify (static hosting) |
| Firebase Authentication (email/password) | Sign-in. Roles come from a `role` custom claim (`ADMIN` / `STAFF`) | Firebase, **Spark (free) plan** |
| Cloud Firestore | Clients, invoices, settings, counters, audit log. Protected by `firestore.rules` | Firebase, **Spark (free) plan** |
| Netlify Functions (`netlify/functions/`) | Server-side code that needs the Admin key: user management (`admin-users`) and the one-time first-ADMIN setup (`claim-admin`) | Netlify |

**Spark plan only.** The app uses no Cloud Functions, no Cloud Storage and no managed backups. The logo is stored
as a small base64 image inside the settings document, and backups are a JSON download (section 5.3).

**Secrets.** The Firebase **web** config (`VITE_FIREBASE_*`) is public by design. The Firebase **Admin**
credentials exist only as Netlify Function environment variables. Only
`.env.example` is committed.

### Data model (Firestore)

| Path | Contents | Who can write |
|---|---|---|
| `settings/firm` | Firm details, bank/UPI, GST rate, SAC list, invoice prefix, due days, brand colour, logo (data URL ≤ 300 KB) | ADMIN |
| `users/{uid}` | Profile mirror (email, name, role, disabled) for the Users page | Netlify Function only |
| `clients/{id}` | Name, contact, email, WhatsApp, address, state + GST state code, GSTIN, PAN | ADMIN, STAFF (deleting a client never changes its past invoices) |
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
netlify/functions/         admin-users.ts, claim-admin.ts, _shared/ (Admin SDK + auth checks)
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
* the functions reject missing or invalid tokens and non-ADMIN callers, and the first-ADMIN setup code
  works exactly once.

---

## 4. Production setup (one-time, for the hosting person)

> Work through these steps in order. Steps 4.1–4.4 are in the Firebase console, 4.5–4.7 in Netlify and DNS, and 4.8–4.9 finish the setup.

### 4.1 Create the Firebase project (stay on Spark)

1. https://console.firebase.google.com → **Add project** (e.g. `lka-invoices`). Google Analytics isn't needed.
2. Leave the billing plan on **Spark (no-cost)**. Never upgrade: nothing in this app needs Blaze.
3. **Project settings → General → Your apps → Web (`</>`)** → register an app (no Hosting). Copy `apiKey`,
   `authDomain`, `projectId` and `appId`; they become the `VITE_FIREBASE_*` variables in 4.5.

### 4.2 Authentication: Google sign-in (+ email/password fallback)

1. **Build → Authentication → Sign-in method → Add new provider → Google → Enable**. Choose a support
   email → Save.
2. Also enable **Email/Password** (leave "Email link" off). It is the hidden fallback ("Use email & password
   instead") and powers **Forgot password?**.
3. **Authentication → Settings → User actions:** keep **"Enable create (sign-up)" ticked**. Google sign-in
   needs it to create the account the first time someone signs in.
   * This is safe. Only emails an ADMIN has added in **Settings → Users** get a role. Anyone else who signs in
     sees "No access yet", and the security rules deny all data to accounts without a role.
4. **Authentication → Settings → Authorized domains:** make sure your site address (e.g.
   `lingeshwarca-invoice.netlify.app`) is listed, otherwise the Google pop-up fails.

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
| `SETUP_CODE` (optional, temporary) | Functions, mark **secret** | one-time code to become the first ADMIN without a terminal (4.8 Option A); delete after use |

   Mark **only** `FIREBASE_PRIVATE_KEY` (and `SETUP_CODE`, if used) as secret. The `VITE_FIREBASE_*` values and
   `FIREBASE_PROJECT_ID` are public by design (they end up in the browser bundle); `netlify.toml` excludes them
   from Netlify's secrets scanning via `SECRETS_SCAN_OMIT_KEYS`. If any of them is marked secret the build fails.

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


### 4.8 Create the first ADMIN (one time)

There are two ways to do this. **Option A** needs no terminal.

**Option A: setup code (browser only)**

1. Netlify → **Environment variables** → add `SETUP_CODE` (scope Functions, mark **secret**). Use a long random
   value of at least 12 characters that only you know. Then trigger a redeploy.
2. Firebase console → **Authentication → Users → Add user** → your email and a password.
3. Open the app, sign in, and on the "No access" page enter the setup code → **Submit**. You are now ADMIN.
4. **Delete `SETUP_CODE` from Netlify.** The function is single-use anyway: it refuses once an ADMIN exists or
   once it has been used.

**Option B: `create-admin` script**

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
3. **Settings → Users → Add a user** for each staff member (role STAFF). Give them their initial password privately.

---

## 5. Operations

### 5.1 Users and sign-in

* **Give access:** ADMIN → **Settings → Users → Give someone access** → their Google email + role. They then
  open the portal, click **Sign in with Google**, and are let in automatically on first sign-in.
* **Active now / last active** is shown for each user. **Disable** blocks sign-in immediately; **Make
  ADMIN/STAFF** changes the role. An ADMIN can't disable or demote themselves.
* **Forgot password** (email fallback only): "Use email & password instead" → type the email → **Forgot
  password?** → Firebase emails a reset link.
* **Privacy:** sessions sign out automatically after 30 minutes without activity. Home-page tasks, events,
  notes and links are private to each user. All data is encrypted in transit (HTTPS) and at rest by Google.
* Keep at least two ADMIN accounts.

### 5.1a GST on or off

**Settings → Firm details → Invoicing → Charge GST on invoices.**
* **OFF** (default): invoices are titled "INVOICE", with no tax lines and no reverse-charge row.
  "Total Amount" / "Total Invoice Value" are shown, and the client's state is optional.
* **ON:** "TAX INVOICE" with CGST + SGST (client in the firm's state) or IGST (other states), reverse charge
  and GSTIN details. Turn this on only if the firm is GST-registered.

### 5.2 Invoicing workflow

The app has three tabs: **Invoices** (home, with this month's / this year's totals), **Clients** and
**Settings** (ADMIN only: firm details, users, backup).

1. **Invoices → + New invoice**.
   * **Client:** choose **Saved client**, or **New / one-off client** and type the details. Tick "Save this
     client to my client list" to keep them; untick it to bill a client once without saving them. The state
     decides CGST+SGST vs IGST.
   * **Services:** pick a service. Its description, SAC code and default price (set in **Settings → Firm
     details → Services you bill**) fill in automatically and can be changed per invoice. Add reimbursements
     (no GST) if needed.
   * **Create invoice** (or **Save as draft** to keep it editable without a number).
2. The invoice page always shows **Download PDF**, **Email** and **WhatsApp** (for a draft, these first
   create the invoice and its number). Email and WhatsApp use your own apps, so no email server is needed:
   * on a phone, the share sheet opens with the PDF attached; pick Gmail, WhatsApp, etc.;
   * on a computer, the PDF downloads and a ready-written email (or WhatsApp chat) opens; attach the PDF and
     send.
3. **✓ Mark as paid** (date, mode, amount received, TDS). ADMIN can **Cancel invoice** with a reason.
5. Every create, edit, issue, payment, cancellation and send is listed under **Activity** on the invoice
   (Firestore `auditLog`).
6. Numbering restarts at `0001` automatically on 1 April (Indian time) for the new financial year.

### 5.3 Backups (do this weekly)

Firestore managed backups need the paid Blaze plan, so this app has its own export instead:

ADMIN → **Settings → Backup → Export all data** → downloads `lka-invoices-backup_YYYY-MM-DD.json` containing settings,
clients, invoices, invoice counters and the full audit log. Keep the files somewhere safe and private (they
contain client and bank data), e.g. an encrypted drive plus one off-site copy. Each export costs one
Firestore read per document. Restoring from a backup would need a developer to write the JSON back with the
Admin SDK.

### 5.4 Free-tier budget

| Limit (Spark / Netlify free) | How the app stays inside it |
|---|---|
| Firestore 50k reads / 20k writes per day | Lists are paginated (20 per page), client search is prefix-based, settings are read once per session, and the dashboard uses server-side `sum()` aggregations (≈1 read per 1,000 invoices) plus a 20-item overdue list |
| Firestore 1 GiB storage | Text only; the logo is capped at ~300 KB |
| Netlify Functions (125k calls / month free) | Called only for user management |
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
| Email button opens nothing on a computer | Set a default email app (e.g. Outlook, Mail, or Gmail via the browser's mailto handler); the PDF is still downloaded |
| Functions return 500 "Internal error" | Netlify → Logs → Functions. Usually missing `FIREBASE_*` variables or a mangled private key |
| Invoice issue fails with a date / FY error | The device clock is wrong. The issue date must match today's date in India |
