"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, CheckCheck, Fingerprint, LoaderCircle, LockKeyhole, MapPin, Menu, Network, Route, ScanLine, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { faqs, risks } from "@/lib/content";

const riskIcons = [Route, Network, ScanLine, ShieldCheck];

function Brand({ footer = false }: { footer?: boolean }) {
  return <Link className={`brand ${footer ? "brand-footer" : ""}`} href="/#top" aria-label="DeFlock Tell City home"><span className="brand-mark"><ScanLine size={23} strokeWidth={1.9} /></span><span>DeFlock<span className="brand-city">TELL CITY</span></span></Link>;
}

function PetitionStatement() {
  return <Dialog>
    <DialogTrigger render={<button className="text-link" />}>Read the full petition <ArrowUpRight size={16} /></DialogTrigger>
    <DialogContent className="petition-dialog">
      <DialogHeader><span className="eyebrow">TO TELL CITY’S ELECTED LEADERS</span><DialogTitle>Remove the cameras.<br />Protect our privacy.</DialogTitle><DialogDescription>Community petition · Tell City, Indiana</DialogDescription></DialogHeader>
      <div className="dialog-prose"><p>We, the undersigned Tell City residents, ask city leaders to end the community’s use of Flock Safety cameras and other automated license plate reader systems.</p><ol><li><strong>End the contracts.</strong> End city agreements for ALPR surveillance, consistent with applicable obligations.</li><li><strong>Remove the cameras.</strong> Remove city-controlled ALPR equipment and do not replace it with another vendor’s equivalent system.</li><li><strong>Account for the data.</strong> Disclose existing retention and sharing practices, end ongoing sharing, and delete retained data where legally permitted.</li><li><strong>Give residents a voice.</strong> Hold a public discussion before considering future surveillance technology.</li></ol><p>Public safety and privacy both deserve serious consideration. We ask for a public response and a clear plan for removal.</p><p className="muted">This is a community advocacy petition. Signing here records support; it does not automatically deliver the petition to city officials.</p></div>
    </DialogContent>
  </Dialog>;
}

function PrivacyDetails() {
  return <Dialog><DialogTrigger render={<button className="text-link privacy-link" />}>How we handle your information</DialogTrigger><DialogContent className="petition-dialog"><DialogHeader><DialogTitle>Your signature. Your privacy.</DialogTitle><DialogDescription>What is saved when you sign this petition.</DialogDescription></DialogHeader><div className="dialog-prose"><p><strong>Saved privately:</strong> your name, ZIP code, submission date, and the version of the petition you agreed to. Your name and ZIP code may be included in a future petition submission to Tell City officials.</p><p><strong>Email:</strong> converted on the server into a keyed fingerprint used to prevent duplicate submissions. The original address is not saved and cannot be used for email updates.</p><p><strong>Publicly visible:</strong> only the total number of submitted signatures. Your name, email, and ZIP code are not listed on this website.</p><p>Petition records are stored with Supabase and accessed through this website’s server. No analytics or advertising trackers are included. Service providers may keep ordinary access logs. When rate limiting is configured, a temporary protected fingerprint of your IP address is used to limit repeated attempts.</p><p>Signatures remain stored until the site operator removes them. If submitted to city officials, petition details may become part of a public record. Do not include additional personal information in the name field.</p></div></DialogContent></Dialog>;
}

export function CommunitySite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signed, setSigned] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch("/api/petition", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error();
      setCount(result.count); setCountError(false);
    } catch { setCountError(true); }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refreshCount(), 0);
    const interval = setInterval(() => void refreshCount(), 30_000);
    const onFocus = () => void refreshCount();
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(initial); clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refreshCount]);

  useEffect(() => { if (signed) successRef.current?.focus(); }, [signed]);

  useEffect(() => {
    // Progressive enhancement: agents can read the same public total, never sign for a resident.
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({ name: "get_petition_signature_count", description: "Read the public count of submitted Tell City petition signatures. Does not verify identities or create a signature.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: async (input: unknown) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("This tool accepts an empty object only.");
        const response = await fetch("/api/petition", { cache: "no-store" });
        if (!response.ok) throw new Error("The signature count is currently unavailable.");
        const result = await response.json();
        setCount(result.count); setCountError(false);
        return { count: result.count, measure: "submitted signatures" };
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser API; normal petition controls remain available. */ }
    return () => lifecycle.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!consent) { setError("Please confirm your residency and support for the petition."); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/petition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), zip: form.get("zip"), consent, website: form.get("website") }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Your signature wasn’t saved. Please try again."); return; }
      setCount(result.count); setCountError(false); setSigned(true); formRef.current?.reset();
    } catch { setError("We couldn’t confirm your signature. Check your connection and try again; repeat submissions with the same email won’t be counted twice."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/#petition`); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 2500); }
    catch { setCopyError(true); }
  }

  const formattedCount = count === null ? "—" : count.toLocaleString("en-US");

  return <div id="top">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="container header-inner"><Brand /><nav className="desktop-nav" aria-label="Main navigation"><a href="#risks">The risks</a><a href="https://maps.deflock.org/?lat=37.9650&lng=-86.7310&zoom=11.04" target="_blank" rel="noreferrer">Camera map</a><Link href="/public-records">Public records</Link><a href="#questions">Common questions</a></nav><a href="#petition" className="nav-petition">Sign the petition <ArrowUpRight size={16} /></a><Button variant="ghost" size="icon" className="mobile-menu-button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button></div>{menuOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">{[{ text: "The risks", href: "#risks" }, { text: "Camera map", href: "https://maps.deflock.org/?lat=37.9650&lng=-86.7310&zoom=11.04", external: true }, { text: "Public records", href: "/public-records" }, { text: "Common questions", href: "#questions" }, { text: "Sign the petition", href: "#petition" }].map(({ text, href, external }) => <Link key={href} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} onClick={() => setMenuOpen(false)}>{text}<ArrowUpRight size={16} /></Link>)}</nav>}</header>

    <main id="main">
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="location-tag"><MapPin size={14} /><span>TELL CITY, INDIANA</span><span className="tag-divider" />A COMMUNITY INITIATIVE</div>
          <h1 id="hero-title">Our streets.<br />Our lives.<br /><span>Our privacy.</span></h1>
          <p className="hero-description">Living in a small town shouldn’t mean leaving a searchable trail. Ask Tell City’s leaders to end the use of Flock cameras and other license plate readers, remove the cameras, and protect our privacy.</p>
          <div className="hero-petition-statement"><PetitionStatement /></div>
          <div className="signature-total" aria-live="polite" aria-atomic="true"><strong>{formattedCount}</strong><span>signatures submitted</span></div>
          {countError && <div className="count-error" role="status">{count === null ? "The count is temporarily unavailable." : "The count may be out of date."} <button onClick={() => void refreshCount()}>Retry</button></div>}
          <p className="count-note">One signature per email. Residency and identity are self-reported.</p>
          <div className="hero-actions"><Link className="public-records-action" href="/public-records">Public records <ArrowUpRight size={16} /></Link><a className="secondary-action" href="#risks">Understand the risks <ArrowDown size={16} /></a></div>
        </div>
        <section className="petition-card" id="petition" aria-labelledby="petition-title">{signed ? <div className="success-state" ref={successRef} tabIndex={-1}><span className="success-icon"><CheckCheck size={32} /></span><span className="eyebrow">YOUR SIGNATURE IS SAVED</span><h2 id="petition-title">You’ve made<br />your voice count.</h2><p>Thank you for standing up for privacy in Tell City. Your signature is now included in the community total.</p><Button className="form-submit" onClick={copyLink}>{copied ? "Link copied" : "Copy the petition link"}{copied ? <Check size={18} /> : <ArrowUpRight size={18} />}</Button><p className="share-status" role="status">{copyError ? `Copy this address to share: ${typeof window !== "undefined" ? window.location.origin : ""}/#petition` : "A conversation with a neighbor is a good next step."}</p></div> : <><div className="form-heading"><div><h2 id="petition-title">Add your name.</h2><p>Support the removal of Flock cameras in Tell City.</p></div><Fingerprint size={28} strokeWidth={1.5} /></div><form ref={formRef} onSubmit={submit} aria-busy={busy}>
          <div className="form-field"><Label htmlFor="petition-name">Full name <span aria-hidden="true">*</span></Label><Input id="petition-name" name="name" placeholder="Your first and last name" autoComplete="name" required minLength={2} maxLength={120} disabled={busy} /></div>
          <div className="form-field"><Label htmlFor="petition-email">Email address <span aria-hidden="true">*</span></Label><Input id="petition-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required maxLength={254} disabled={busy} aria-describedby="email-note" /><p id="email-note" className="field-note">Only used to prevent duplicate signatures. No mailing list.</p></div>
          <div className="form-field"><Label htmlFor="petition-zip">ZIP code <span aria-hidden="true">*</span></Label><Input id="petition-zip" name="zip" placeholder="47586" autoComplete="postal-code" inputMode="numeric" pattern="47586" title="This petition is for Tell City residents in ZIP code 47586." required maxLength={5} disabled={busy} /><p className="field-note">For residents of Tell City, Indiana.</p></div>
          <div className="honeypot" aria-hidden="true"><label htmlFor="website">Leave this blank</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
          <div className="consent-field"><Checkbox id="petition-consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} disabled={busy} aria-describedby="petition-privacy" /><Label htmlFor="petition-consent">I live or work in Tell City and support this petition. I agree that my name and ZIP code may be included in a petition submitted to city officials.</Label></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" className="form-submit" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" size={18} /> Saving your signature…</> : <>Sign the petition <ArrowUpRight size={18} /></>}</Button>
          <div className="form-privacy" id="petition-privacy"><LockKeyhole size={14} /><span>Your details are not displayed publicly.</span></div><PrivacyDetails />
        </form></>}</section>
      </section>

      <section className="section container risks-section" id="risks" aria-labelledby="risks-title"><div className="section-heading"><div><span className="eyebrow section-kicker">UNDERSTAND THE RISKS</span><h2 id="risks-title">More than a picture<br />of a license plate.</h2></div><p>Ordinary trips can leave extraordinary amounts of information. Here’s what deserves a closer look.</p></div><Accordion multiple className="risk-grid">{risks.map((risk, i) => { const Icon = riskIcons[i]; return <AccordionItem key={risk.id} value={risk.id} className="risk-card"><div className="risk-card-top"><Icon size={26} strokeWidth={1.5} /><span>{risk.id}</span></div><AccordionTrigger className="risk-trigger"><span><strong>{risk.title}</strong><span>{risk.short}</span><span className="risk-read">Explore the concern</span></span></AccordionTrigger><AccordionContent className="risk-detail"><p>{risk.detail}</p><div><span className="eyebrow">A QUESTION FOR OUR CITY</span><strong>{risk.question}</strong></div><a href={risk.source} target="_blank" rel="noreferrer">Read TCPD’s policy <ArrowUpRight size={14} /></a></AccordionContent></AccordionItem>; })}</Accordion>
        <aside className="privacy-principle" aria-labelledby="privacy-principle-title">
          <div>
            <span className="eyebrow">THE “NOTHING TO HIDE” ARGUMENT</span>
            <h3 id="privacy-principle-title">Nothing to hide.<br />Still something to lose.</h3>
          </div>
          <div className="privacy-principle-copy">
            <p>Would knowing where every resident has been help solve some crimes? Sure. But that alone wouldn’t justify putting an ankle monitor on every person in Tell City.</p>
            <p>License plate cameras work differently: they record vehicle sightings at camera locations, not every resident’s continuous movements. Yet they raise a similar concern—building searchable movement records about people who are not suspected of a crime.</p>
            <p className="privacy-principle-stance">“If you aren’t doing anything wrong, you have nothing to worry about” misses the point. Privacy is worth protecting even when you have nothing to hide. We reject the police-state logic that everyone should be monitored just in case it proves useful.</p>
          </div>
        </aside>
        <div className="local-note"><MapPin size={21} /><div><strong>This is a local conversation.</strong><p>TCPD released its ALPR policy, original contract, invoices, and council briefing with its October 2, 2026 response.</p></div><Link href="/public-records#tcpd-records">View the released records <ArrowUpRight size={16} /></Link></div></section>

      <section className="section container faq-section" id="questions" aria-labelledby="faq-title"><div><span className="eyebrow section-kicker">COMMON QUESTIONS</span><h2 id="faq-title">Good questions.<br />Straight answers.</h2><p>You don’t need to be a technology expert to be part of this conversation.</p></div><Accordion className="faq-list">{faqs.map((faq, i) => <AccordionItem key={faq.q} value={String(i)}><AccordionTrigger>{faq.q}</AccordionTrigger><AccordionContent><p>{faq.a}</p>{faq.source && <a className="text-link faq-source" href={faq.source.href} target="_blank" rel="noreferrer">{faq.source.label} <ArrowUpRight size={14} /></a>}</AccordionContent></AccordionItem>)}</Accordion></section>

    </main>

    <footer className="site-footer"><div className="container footer-top"><Brand footer /><p>Our town. Our conversation.<br />Our right to a private life.</p><a href="#top">Back to top <ArrowUpRight size={16} /></a></div><div className="container footer-bottom"><span>An independent community petition. Not affiliated with city government or Flock Safety.</span><span>TELL CITY, IN · 47586</span></div></footer>
  </div>;
}
