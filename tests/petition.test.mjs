import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";

const origin = "http://127.0.0.1:3197";
const secret = "test-only-supabase-secret-never-used-remotely";
const hashSecret = "test-only-email-hash-secret-at-least-32-characters";
const fingerprint = (value) => createHmac("sha256", hashSecret).update(value).digest("hex");

// A local PostgREST-shaped HTTP adapter runs the actual migration's PostgreSQL
// functions. No live Supabase project or real petition records are used.
test("Supabase petition API, PostgreSQL permissions, and legacy import", { timeout: 90_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "deflock-supabase-test-"));
  const db = new PGlite();
  let app;
  let output = "";
  let available = true;
  let fault = null;
  const capturedSubmissions = [];
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  await db.exec(await readFile("supabase/migrations/202609100001_petition.sql", "utf8"));

  async function asRole(role, sql, params = []) {
    return db.transaction(async (tx) => {
      // role is one of the fixed test roles, never a request-controlled string.
      await tx.exec(`SET LOCAL ROLE ${role}`);
      return tx.query(sql, params);
    });
  }
  const api = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (!available) { response.writeHead(503); response.end(JSON.stringify({ message: "Test database unavailable" })); return; }
    if (request.headers.apikey !== secret) { response.writeHead(401); response.end("{}"); return; }
    try {
      const url = new URL(request.url, "http://localhost");
      let raw = "";
      for await (const chunk of request) raw += chunk.toString();
      const args = raw ? JSON.parse(raw) : {};
      let result;
      if (url.pathname === "/rest/v1/rpc/petition_signature_count") {
        const query = await asRole("service_role", "SELECT public.petition_signature_count() AS count");
        result = Number(query.rows[0].count);
      } else if (url.pathname === "/rest/v1/rpc/submit_petition_signature") {
        capturedSubmissions.push(args);
        const query = await asRole("service_role", "SELECT public.submit_petition_signature($1, $2, $3, $4, $5) AS result", [args.p_name, args.p_email_hash, args.p_zip, args.p_petition_version, args.p_rate_key]);
        result = query.rows[0].result;
      } else if (url.pathname === "/rest/v1/petition_signatures" && request.method === "POST") {
        assert.equal(url.searchParams.get("on_conflict"), "email_hash");
        assert.match(request.headers.prefer, /resolution=ignore-duplicates/);
        for (const row of args) await asRole("service_role", "INSERT INTO public.petition_signatures (name,email_hash,zip,petition_version,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(email_hash) DO NOTHING", [row.name, row.email_hash, row.zip, row.petition_version, row.created_at]);
        result = null;
      } else if (url.pathname === "/rest/v1/petition_signatures" && request.method === "GET") {
        const hashes = url.searchParams.get("email_hash").slice(4, -1).split(",");
        const query = await asRole("service_role", "SELECT name,email_hash,zip,petition_version,created_at FROM public.petition_signatures WHERE email_hash = ANY($1::text[])", [hashes]);
        result = query.rows;
      } else throw new Error(`Unexpected test endpoint: ${url.pathname}`);
      response.end(JSON.stringify(result));
    } catch (error) {
      fault = error;
      response.writeHead(500); response.end(JSON.stringify({ message: "Local adapter failure" }));
    }
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const supabaseUrl = `http://127.0.0.1:${api.address().port}`;
  const env = { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: secret, PETITION_HASH_SECRET: hashSecret, APP_ORIGIN: origin, TRUSTED_IP_HEADER: "x-test-ip", NEXT_TELEMETRY_DISABLED: "1", VERCEL: "0" };

  async function start(overrides = {}) {
    output = "";
    app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3197"], { env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not become ready: ${output}`)), 20_000);
      const read = (chunk) => { output += chunk.toString(); if (output.includes("Ready in")) { clearTimeout(timer); resolve(); } };
      app.stdout.on("data", read); app.stderr.on("data", read);
      app.once("error", (error) => { clearTimeout(timer); reject(error); });
      app.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
    });
  }
  async function stop() {
    if (!app || app.exitCode !== null) return;
    const exited = once(app, "exit"); app.kill("SIGTERM"); await exited;
  }
  t.after(async () => {
    await stop();
    await new Promise((resolve) => api.close(resolve));
    await db.close(); await rm(directory, { recursive: true, force: true });
  });
  await start();
  const valid = { name: "Test Resident", email: "resident@example.test", zip: "47586", consent: true, website: "" };
  const submit = (body = valid, extraHeaders = {}) => fetch(`${origin}/api/petition`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...extraHeaders }, body: JSON.stringify(body) });
  const count = async () => (await fetch(`${origin}/api/petition`)).json();

  await t.test("the page renders and the API returns only the uncached count", async () => {
    const page = await fetch(origin);
    assert.equal(page.status, 200); assert.match(await page.text(), /Add your name/);
    const response = await fetch(`${origin}/api/petition`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { count: 0 });
  });
  await t.test("consent, local ZIP code, email, and honeypot are validated", async () => {
    for (const change of [{ consent: false }, { zip: "99999" }, { email: "invalid" }, { name: " " }, { website: "spam.example" }]) assert.equal((await submit({ ...valid, ...change })).status, 400);
    assert.deepEqual(await count(), { count: 0 });
  });
  await t.test("cross-origin, malformed, and oversized submissions are rejected", async () => {
    assert.equal((await submit(valid, { Origin: "https://unrelated.example" })).status, 403);
    assert.equal((await submit(valid, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await submit({ ...valid, name: "x".repeat(5000) })).status, 413);
    const response = await fetch(`${origin}/api/petition`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "{" });
    assert.equal(response.status, 400);
  });
  await t.test("a signature saves through the Supabase client without transmitting plaintext email", async () => {
    const response = await submit();
    assert.equal(response.status, 201, String(fault));
    assert.deepEqual(await response.json(), { count: 1 });
    assert.equal(capturedSubmissions[0].p_email_hash, fingerprint(`email:${valid.email}`));
    assert.doesNotMatch(JSON.stringify(capturedSubmissions), /@example/);
    const rows = (await db.query("SELECT * FROM public.petition_signatures")).rows;
    assert.equal(rows[0].petition_version, "2026-09-10-v1");
    assert.doesNotMatch(JSON.stringify(rows), /@example/);
  });
  await t.test("normalized and concurrent duplicate emails increment the count only once", async () => {
    assert.equal((await submit({ ...valid, email: "  RESIDENT@EXAMPLE.TEST  " })).status, 409);
    const responses = await Promise.all(Array.from({ length: 6 }, () => submit({ ...valid, email: "concurrent@example.test" })));
    assert.equal(responses.filter((r) => r.status === 201).length, 1);
    assert.equal(responses.filter((r) => r.status === 409).length, 5);
    assert.deepEqual(await count(), { count: 2 });
  });
  await t.test("database permissions deny anonymous and authenticated clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["petition_signatures", "petition_rate_limits"]) {
        await assert.rejects(asRole(role, `SELECT * FROM public.${table}`), /permission denied/);
      }
      await assert.rejects(asRole(role, "SELECT public.petition_signature_count()"), /permission denied/);
      await assert.rejects(asRole(role, "SELECT public.submit_petition_signature('Test',$1,'47586','v1',null)", ["a".repeat(64)]), /permission denied/);
    }
    const tables = await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('petition_signatures','petition_rate_limits')");
    assert.ok(tables.rows.every((table) => table.relrowsecurity));
  });
  await t.test("PostgreSQL rejects invalid data even if application validation is bypassed", async () => {
    await assert.rejects(asRole("service_role", "SELECT public.submit_petition_signature('Test',$1,'99999','v1',null)", ["a".repeat(64)]), /Invalid petition submission/);
    await assert.rejects(asRole("service_role", "INSERT INTO public.petition_signatures (name,email_hash,zip,petition_version) VALUES ('Test','plaintext-email','47586','v1')"), /check constraint/);
  });
  await t.test("rate limits persist across app instances and reset after expiry", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await submit(valid, { "x-test-ip": "192.0.2.5" })).status, 409);
    await stop(); await start();
    assert.equal((await submit(valid, { "x-test-ip": "192.0.2.5" })).status, 429);
    await db.query("UPDATE public.petition_rate_limits SET expires_at=now()-interval '1 second'");
    assert.equal((await submit(valid, { "x-test-ip": "192.0.2.5" })).status, 409);
    const limits = (await db.query("SELECT * FROM public.petition_rate_limits")).rows;
    assert.equal(limits[0].attempts, 1);
    assert.equal(limits[0].key, fingerprint("rate:192.0.2.5"));
  });
  await t.test("Supabase outages return recoverable errors instead of a false zero or success", async () => {
    available = false;
    assert.equal((await fetch(`${origin}/api/petition`)).status, 503);
    assert.equal((await submit({ ...valid, email: "outage@example.test" })).status, 503);
    available = true;
    assert.deepEqual(await count(), { count: 2 });
  });
  await t.test("legacy import preserves dates and fingerprints and is safe to rerun", async () => {
    const path = join(directory, "legacy.sqlite");
    const sqlite = new DatabaseSync(path);
    sqlite.exec("CREATE TABLE signatures (id INTEGER PRIMARY KEY, name TEXT, email_hash TEXT, zip TEXT, petition_version TEXT, created_at TEXT)");
    sqlite.prepare("INSERT INTO signatures VALUES (1,?,?,?,?,?)").run("Legacy Test", fingerprint("email:legacy@example.test"), "47586", "2026-09-10-v1", "2026-09-10T12:00:00.000Z");
    sqlite.close();
    await writeFile(join(directory, ".petition-key"), hashSecret);
    for (let i = 0; i < 2; i++) {
      const result = await promisify(execFile)(process.execPath, ["scripts/import-sqlite.mjs", path], { env });
      assert.match(result.stdout, /Verified 1 signature/);
    }
    assert.deepEqual(await count(), { count: 3 });
    await assert.rejects(promisify(execFile)(process.execPath, ["scripts/import-sqlite.mjs", path], { env: { ...env, PETITION_HASH_SECRET: "wrong-secret-that-is-at-least-32-characters" } }), /does not match/);
    const result = await submit({ ...valid, email: "legacy@example.test" });
    assert.equal(result.status, 409);
  });
  await t.test("missing Supabase configuration fails closed and the app still renders", async () => {
    await stop(); await start({ SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" });
    assert.equal((await fetch(origin)).status, 200);
    assert.equal((await fetch(`${origin}/api/petition`)).status, 503);
    assert.equal((await submit()).status, 503);
    await stop(); await start();
    assert.deepEqual(await count(), { count: 3 });
  });
  assert.equal(fault, null);
});
