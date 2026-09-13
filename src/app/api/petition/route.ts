import { NextRequest, NextResponse } from "next/server";
import { addSignature, countSignatures } from "@/lib/db";
import { petitionSchema } from "@/lib/petition-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
function fail(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }

export async function GET() {
  try { return NextResponse.json({ count: await countSignatures() }, { headers }); }
  catch { console.error("Petition count unavailable."); return fail("The signature count is temporarily unavailable. Please try again.", 503); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.APP_ORIGIN || request.nextUrl.origin;
  if (!origin || origin !== expectedOrigin) return fail("Please submit the petition from this website.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Please submit the petition form.", 415);
  // Bound the actual stream as well as Content-Length, which clients can omit.
  if (Number(request.headers.get("content-length") || 0) > 4096) return fail("The submission is too large.", 413);
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail("The submission is empty.", 400);
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return fail("The submission is too large.", 413); }
      body += decoder.decode(value, { stream: true });
    }
    input = JSON.parse(body + decoder.decode());
  } catch { return fail("We couldn’t read that submission. Please try again.", 400); }
  const parsed = petitionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Please check your details.", 400);
  try {
    // Only use a header guaranteed to be overwritten by the deployment's proxy.
    const ipHeader = process.env.TRUSTED_IP_HEADER || (process.env.VERCEL === "1" ? "x-forwarded-for" : null);
    const client = ipHeader ? request.headers.get(ipHeader)?.split(",")[0]?.trim() || null : null;
    const result = await addSignature(parsed.data, client);
    if (result.status === "rate_limited") return fail("Too many attempts. Please try again in 10 minutes.", 429);
    if (result.status === "duplicate") return fail("A signature has already been submitted with this email. Thank you for your support.", 409);
    return NextResponse.json({ count: result.count }, { status: 201, headers });
  } catch { console.error("Petition submission unavailable."); return fail("We couldn’t confirm your signature. Please try again with the same email; it won’t be counted twice.", 503); }
}
