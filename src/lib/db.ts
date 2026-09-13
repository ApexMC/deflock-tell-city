import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "./supabase";
import { PETITION_VERSION } from "./petition-schema";

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const submissionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), count: countSchema }),
  z.object({ status: z.literal("duplicate"), count: countSchema }),
  z.object({ status: z.literal("rate_limited"), count: z.null() }),
]);

function hash(value: string) {
  const secret = process.env.PETITION_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("PETITION_HASH_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function countSignatures() {
  const { data, error } = await getSupabase().rpc("petition_signature_count");
  if (error) throw new Error("Supabase could not read the petition count.");
  return countSchema.parse(data);
}

export async function addSignature(input: { name: string; email: string; zip: string }, client: string | null) {
  const { data, error } = await getSupabase().rpc("submit_petition_signature", {
    p_name: input.name,
    p_email_hash: hash(`email:${input.email.trim().toLowerCase()}`),
    p_zip: input.zip,
    p_petition_version: PETITION_VERSION,
    p_rate_key: client ? hash(`rate:${client}`) : null,
  });
  if (error) throw new Error("Supabase could not save the petition signature.");
  return submissionSchema.parse(data);
}
