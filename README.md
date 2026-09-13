# DeFlock Tell City

A Next.js + shadcn site for Tell City, Indiana residents to understand automated license plate readers and sign a petition for their removal. The site uses a dark theme, red accents, locally served Geist fonts, accessible interactive explanations, and a private petition form.

**The application now uses Supabase Postgres for signature storage.** Next.js handles validation and talks to Supabase from the server. Vercel instances share one database; the application no longer writes SQLite files or generates local keys at runtime.

## 1. Create the Supabase tables

In your existing Supabase project, open **SQL Editor → New query**. Paste and run the complete file:

[`supabase/migrations/202609100001_petition.sql`](supabase/migrations/202609100001_petition.sql)

Run it once, as a complete transaction. It creates both tables, their constraints, indexes, permissions, and the two functions used by the application. Do not create the tables manually first. If you use the Supabase CLI, the file is also a standard migration; apply it through your linked project's normal migration workflow instead of also running it in the SQL Editor.

### `public.petition_signatures`

| Column | PostgreSQL type | Purpose |
| --- | --- | --- |
| `id` | `bigint`, generated identity, primary key | Database-generated identifier |
| `name` | `text`, required | Full name, 2–120 characters |
| `email_hash` | `text`, required, **unique** | 64-character keyed SHA-256 email fingerprint; no plaintext email |
| `zip` | `text`, required | Restricted to `47586` |
| `petition_version` | `text`, required | Petition wording accepted by the signer |
| `created_at` | `timestamptz`, required, default `now()` | Submission timestamp |

The unique constraint on `email_hash` creates an index and prevents simultaneous duplicate submissions. ZIP codes remain text, not numbers. The identity key is generated automatically; forms never supply it.

### `public.petition_rate_limits`

| Column | PostgreSQL type | Purpose |
| --- | --- | --- |
| `key` | `text`, primary key | Keyed client-IP fingerprint; no raw IP |
| `attempts` | `integer`, required | Attempts in the current window, capped at 6 |
| `expires_at` | `timestamptz`, required, indexed | End of the ten-minute window |

The limit is five valid-form submission attempts per client per ten minutes. Duplicate attempts count toward the limit. Expired fingerprints are deleted on the next valid submission; if the site receives no further submissions, they remain until a later submission or administrator cleanup. Limits are shared across Vercel instances.

### Permissions and functions

Both tables have **Row Level Security enabled** and no browser-access policies. `anon` and `authenticated` roles cannot read or write them. Signing into Supabase Auth does not provide access to petition records.

The server calls:

- `petition_signature_count()` — returns the aggregate count only.
- `submit_petition_signature(...)` — applies rate limiting and inserts a signature in one database transaction, returning `created`, `duplicate`, or `rate_limited` and the count when applicable.

Both functions are `SECURITY INVOKER`, use an empty search path and schema-qualified references, and are executable only by `service_role`. The migration explicitly revokes PostgreSQL's default public function permissions. Do not add a public read policy or expose the server secret key to the browser. See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys) and [database function permissions](https://supabase.com/docs/guides/database/functions).

## 2. Configure local development

Requires Node.js 24+ and npm.

```sh
npm install
```

Create `.env.local` from `.env.example` if it does not already exist. **Do not overwrite an existing hash secret.** In this workspace, `.env.local` has been prepared with the old SQLite hash secret; fill in its two blank Supabase values.

| Environment variable | Value |
| --- | --- |
| `SUPABASE_URL` | Project API URL, such as `https://your-project.supabase.co` |
| `SUPABASE_SECRET_KEY` | Server secret key from Supabase API Keys settings (`sb_secret_…`); a legacy `service_role` JWT also works |
| `PETITION_HASH_SECRET` | Stable secret of at least 32 characters, identical across environments sharing the database |
| `APP_ORIGIN` | Exact public HTTPS origin in production, without a trailing slash; leave unset locally |
| `TRUSTED_IP_HEADER` | Optional on other hosts; see rate limiting below |

**Never prefix either secret with `NEXT_PUBLIC_`.** No Supabase publishable/anon key is needed by this application. Next.js keeps unprefixed variables server-side; the Supabase module also imports `server-only` to prevent accidental browser use.

For a completely new petition with no prior signatures, generate a hash secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and save it privately. For this existing petition, preserve the value from `.data/.petition-key` instead. Changing that value after signatures exist breaks duplicate detection for previous signers.

```sh
npm run dev
```

Open http://localhost:3000. Restart the development server after changing environment variables. If configuration or the migration is missing, reading/signing returns a recoverable unavailable state; there is no SQLite fallback or fake count. The information pages still render.

## 3. Import the existing local signature records

The original `.data/petition.sqlite` and `.data/.petition-key` have been preserved. **No local signatures have been uploaded automatically.** After applying the SQL migration and configuring `.env.local`, run:

```sh
npm run import:sqlite -- --dry-run
npm run import:sqlite
```

An alternate database path can be supplied after `--`. The import is a local maintenance command using Node's built-in SQLite reader; it is not part of the deployed request path.

The import reads the SQLite database without modifying it, preserves names, ZIP codes, timestamps, petition versions, and email fingerprints, and verifies the destination records. Supabase assigns new row IDs. It skips existing email fingerprints, so it can be rerun after a partial failure without double-counting. It refuses to run if `PETITION_HASH_SECRET` differs from the source database's adjacent `.petition-key`. If the old deployment used an environment secret instead of a key file, supply that original secret.

Pause signature collection on the old site during the final import/cutover so submissions made after the import are not left behind. Keep the old database and key securely backed up until the imported count is confirmed. The tool prints totals and errors, never signature details or secrets.

## 4. Deploy to Vercel

Import the project into Vercel as **Next.js**, use Node.js 24, and keep the default build command (`npm run build`). Configure the same `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `PETITION_HASH_SECRET` in Vercel's environment variables. Set `APP_ORIGIN` to the site's exact public origin, such as `https://your-site.vercel.app` or your custom domain. Redeploy after saving environment changes.

On Vercel, IP rate limiting automatically uses its overwritten `x-forwarded-for` header. On a different host, set `TRUSTED_IP_HEADER` only to a header your reverse proxy overwrites with the actual client IP. With neither Vercel nor an explicit trusted header, IP limiting is disabled. See [Vercel's request header documentation](https://vercel.com/docs/headers/request-headers).

Use a separate Supabase project for preview/testing deployments if you want to keep test signatures out of production. Give each environment its own correct `APP_ORIGIN`; a preview deployment will not accept submissions when configured with a different production origin. Environments that share a database must share the hash secret.

Vercel needs no persistent disk. The Supabase database holds records across app restarts, redeployments, and multiple instances. Review the count in Supabase's Table Editor and on the site after import/deployment. No Vercel deployment or remote Supabase migration is performed by creating these source files.

## Petition privacy and API

- `GET /api/petition` returns only `{ "count": number }`, with caching disabled.
- `POST /api/petition` accepts `name`, `email`, `zip`, `consent: true`, and an empty `website` honeypot. Same-origin checks and a 4 KB request limit apply.
- The email is normalized and HMAC-hashed **before** the Supabase request. Plaintext emails are never sent to or saved in Supabase by this code.
- Names and ZIP codes are private, and may be included in a future petition submission to city officials as disclosed in the form. Nothing automatically sends them to the city.
- The count measures submissions; identity and residency are self-reported. Different email addresses can belong to the same person.
- No public supporter list, administrator API, marketing email collection, analytics, or ad trackers are included.
- The public count refreshes every 30 seconds and on window focus. Optional read-only WebMCP support never signs for a resident.

When materially changing the actual petition text, update `PETITION_VERSION` and retain the historical wording in source history. Before public launch, establish an organizer contact/removal process and manage retention and backups in Supabase.

## Verification

```sh
npm run build
npm test
```

The tests run the production Next.js app on `127.0.0.1:3197` against a local PostgREST-shaped HTTP adapter backed by PGlite's PostgreSQL engine. They execute the real SQL migration and database functions, including permission checks for anonymous/authenticated roles, validation, duplicate protection, rate limits across app restarts, outages, and repeatable SQLite import. They never connect to a live Supabase project or modify the actual petition records.

These checks validate application behavior and PostgreSQL logic, not the configuration of your remote Supabase project or a deployed Vercel instance. Browser interaction testing and the optional WebMCP browser API are not covered.

## Content sources

Sources were reviewed September 10, 2026. The local reporting establishes Flock's introduction in 2021, not a current camera inventory. The route diagram is explicitly illustrative. Copy distinguishes ALPR sightings from continuous personal tracking.

- [EFF: Automated License Plate Readers](https://sls.eff.org/technologies/automated-license-plate-readers-alprs?language=en)
- [14 News: Tell City police adopts new camera surveillance system](https://www.14news.com/2021/08/07/tell-city-police-adopts-new-camera-surveillance-system/)
- [Flock Safety: Data Privacy & Protection](https://www.flocksafety.com/trust/data-privacy)
- [Flock Safety: Data deletion](https://www.flocksafety.com/blog/how-does-flock-handle-license-plate-data-deletion)
