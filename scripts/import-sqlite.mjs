import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// This one-time local tool is the only production-source use of SQLite.
// It never removes or rewrites the original database, and never prints records.
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((arg) => !arg.startsWith("--")) || ".data/petition.sqlite";
  const secret = process.env.PETITION_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Set PETITION_HASH_SECRET to the original SQLite hash secret before importing.");
  const keyPath = join(dirname(path), ".petition-key");
  if (existsSync(keyPath) && readFileSync(keyPath, "utf8").trim() !== secret) {
    throw new Error("PETITION_HASH_SECRET does not match the original .petition-key. Import stopped to preserve duplicate protection.");
  }
  const database = new DatabaseSync(path, { readOnly: true });
  let records;
  try {
    records = database.prepare("SELECT name, email_hash, zip, petition_version, created_at FROM signatures ORDER BY id").all();
  } finally { database.close(); }
  for (const row of records) {
    if (typeof row.name !== "string" || row.name.trim().length < 2 || row.name.length > 120
      || !/^[a-f0-9]{64}$/.test(row.email_hash) || row.zip !== "47586"
      || typeof row.petition_version !== "string" || !row.petition_version.length
      || !Number.isFinite(Date.parse(row.created_at))) throw new Error("A source record failed validation. Nothing has been imported.");
  }
  if (dryRun) { console.log(`Validated ${records.length} local signature(s). No records sent to Supabase.`); return; }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY, then apply the SQL migration before importing.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }) },
  });
  for (let offset = 0; offset < records.length; offset += 100) {
    const batch = records.slice(offset, offset + 100);
    const { error } = await supabase.from("petition_signatures").upsert(batch, { onConflict: "email_hash", ignoreDuplicates: true });
    if (error) throw new Error("Supabase import failed. Check the migration and server credentials. Rerunning safely skips existing email fingerprints.");
    const { data, error: verifyError } = await supabase.from("petition_signatures")
      .select("name,email_hash,zip,petition_version,created_at").in("email_hash", batch.map((row) => row.email_hash));
    if (verifyError || !data || batch.some((original) => !data.some((stored) =>
      stored.email_hash === original.email_hash && stored.name === original.name && stored.zip === original.zip
      && stored.petition_version === original.petition_version && Date.parse(stored.created_at) === Date.parse(original.created_at)))) {
      throw new Error("Import verification found missing or differing records. The original SQLite database is intact; review the destination before proceeding.");
    }
  }
  console.log(`Verified ${records.length} signature(s) in Supabase. Original SQLite data is unchanged.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Import failed."); process.exitCode = 1; });
