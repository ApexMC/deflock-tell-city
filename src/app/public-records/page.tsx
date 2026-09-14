import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  FileSearch,
  ScanLine,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Public Records Timeline — DeFlock Tell City",
  description:
    "Follow the status of public records requests sent to Tell City, the Tell City Police Department, and the Perry County Sheriff’s Office.",
};

type TimelineEvent = {
  date: string;
  label: string;
  title: string;
  description: string;
  state: "complete" | "current" | "future";
  links?: { label: string; href: string }[];
};

type AgencyTimeline = {
  id: string;
  agency: string;
  jurisdiction: string;
  status: string;
  summary: string;
  logo: { src: string; width: number; height: number };
  events: TimelineEvent[];
};

const timelines: AgencyTimeline[] = [
  {
    id: "tell-city",
    agency: "Tell City / Tell City Police",
    jurisdiction: "Municipal request",
    status: "Acknowledged · awaiting records",
    summary:
      "Tell City confirmed receipt one week after delivery and referred the request to the Chief of Police.",
    logo: { src: "/images/tcpd_logo.png", width: 148, height: 151 },
    events: [
      {
        date: "September 4, 2026",
        label: "FRIDAY",
        title: "Request Received",
        description: "The public records request was received by Tell City.",
        state: "complete",
      },
      {
        date: "September 11, 2026",
        label: "FRIDAY · 7 DAYS LATER",
        title: "City Receipt Acknowledged",
        description:
          "Tell City acknowledged the request and handed it off to the Tell City Chief of Police.",
        state: "complete",
      },
      {
        date: "September 14, 2026",
        label: "MONDAY · 3 DAYS LATER",
        title: "TCPD Receipt Acknowledged",
        description:
          "Tell City Police Chief acknowledged the request. TCPD is reviewing the request however states that the extensive scope of the request may demand additional time for a thorough response.",
        state: "complete",
      },
      {
        date: "Current status",
        label: "AWAITING RELEASE",
        title: "Records pending",
        description: "No responsive records have been received yet.",
        state: "current",
      },
      {
        date: "Date to be determined",
        label: "NEXT MILESTONE",
        title: "Records received",
        description:
          "When records are released, links to view each file will appear with this event.",
        state: "future",
        links: [],
      },
    ],
  },
  {
    id: "perry-county",
    agency: "Perry County Sheriff’s Office",
    jurisdiction: "County request",
    status: "Submitted · awaiting response",
    summary:
      "The request has been delivered, but no acknowledgment or other response has been received.",
    logo: { src: "/images/pcso_logo.png", width: 375, height: 366 },
    events: [
      {
        date: "September 10, 2026",
        label: "THURSDAY",
        title: "Request submitted",
        description:
          "The public records request was submitted to the Perry County Sheriff’s Office.",
        state: "complete",
      },
      {
        date: "As of September 14, 2026",
        label: "NO RESPONSE RECEIVED",
        title: "Awaiting acknowledgment",
        description:
          "No acknowledgment or response has been received from the Perry County Sheriff’s Office.",
        state: "current",
      },
      {
        date: "Date to be determined",
        label: "NEXT MILESTONE",
        title: "Records received",
        description:
          "When records are released, links to view each file will appear with this event.",
        state: "future",
        links: [],
      },
    ],
  },
];

function RecordsBrand() {
  return (
    <Link className="brand" href="/#top" aria-label="DeFlock Tell City home">
      <span className="brand-mark">
        <ScanLine size={23} strokeWidth={1.9} />
      </span>
      <span>
        DeFlock<span className="brand-city">TELL CITY</span>
      </span>
    </Link>
  );
}

function Timeline({ timeline }: { timeline: AgencyTimeline }) {
  return (
    <article className="records-agency" aria-labelledby={`${timeline.id}-title`}>
      <div className="records-agency-heading">
        <div className="records-agency-icon" aria-hidden="true">
          <Image
            src={timeline.logo.src}
            width={timeline.logo.width}
            height={timeline.logo.height}
            alt=""
          />
        </div>
        <div>
          <span className="eyebrow">{timeline.jurisdiction}</span>
          <h2 id={`${timeline.id}-title`}>{timeline.agency}</h2>
        </div>
      </div>

      <div className="records-status">
        <span className="records-status-dot" aria-hidden="true" />
        <span>{timeline.status}</span>
      </div>
      <p className="records-agency-summary">{timeline.summary}</p>

      <ol className="records-timeline">
        {timeline.events.map((event) => (
          <li className={`records-event records-event-${event.state}`} key={`${event.date}-${event.title}`}>
            <div className="records-marker" aria-hidden="true">
              {event.state === "complete" ? (
                <Check size={14} strokeWidth={2.5} />
              ) : event.state === "current" ? (
                <Clock3 size={14} strokeWidth={2.2} />
              ) : (
                <span />
              )}
            </div>
            <div className="records-event-body">
              <div className="records-event-meta">
                <time>{event.date}</time>
                <span>{event.label}</span>
              </div>
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              {event.links && event.links.length > 0 && (
                <div className="records-files" aria-label={`Records released by ${timeline.agency}`}>
                  {event.links.map((record) => (
                    <a href={record.href} key={record.href} target="_blank" rel="noreferrer">
                      <FileSearch size={16} />
                      {record.label}
                      <ArrowUpRight size={14} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function PublicRecordsPage() {
  return (
    <div id="top" className="records-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="container header-inner records-header-inner">
          <RecordsBrand />
          <nav className="records-nav" aria-label="Public records navigation">
            <Link href="/#top">
              <ArrowLeft size={15} /> Home
            </Link>
            <Link className="nav-petition" href="/#petition">
              Sign the petition <ArrowUpRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="records-hero container" aria-labelledby="records-title">
          <div className="records-hero-copy">
            <span className="eyebrow section-kicker">PUBLIC RECORDS TRACKER · UPDATED SEPTEMBER 14, 2026</span>
            <h1 id="records-title">
              Public records.<br />
              <span>Public timeline.</span>
            </h1>
            <p>
              A clear account of requests for records about local license plate reader use—and how public agencies respond.
            </p>
          </div>

          <dl className="records-overview" aria-label="Request overview">
            <div>
              <dt>Requests filed</dt>
              <dd>2</dd>
            </div>
            <div>
              <dt>Acknowledged</dt>
              <dd>1</dd>
            </div>
            <div>
              <dt>Records received</dt>
              <dd>0</dd>
            </div>
          </dl>
        </section>

        <div className="records-divider">
          <div className="container records-divider-inner">
            <span>Two agencies. One public record.</span>
            <span className="records-legend"><i /> Active request</span>
          </div>
        </div>

        <section className="records-board container" aria-label="Public records request timelines">
          {timelines.map((timeline) => (
            <Timeline timeline={timeline} key={timeline.id} />
          ))}
        </section>

        <aside className="records-note container" aria-labelledby="records-note-title">
          <FileSearch size={25} strokeWidth={1.6} aria-hidden="true" />
          <div>
            <span className="eyebrow">WHY TRACK THIS PUBLICLY?</span>
            <h2 id="records-note-title">Transparency should be easy to follow.</h2>
            <p>
              This page reflects correspondence received as of September 14, 2026. It will be updated as agencies respond and records are released.
            </p>
          </div>
        </aside>
      </main>

      <footer className="site-footer records-footer">
        <div className="container footer-top">
          <RecordsBrand />
          <p>
            Requests made in public.<br />Responses tracked in public.
          </p>
          <a href="#top">Back to top <ArrowUpRight size={16} /></a>
        </div>
        <div className="container footer-bottom">
          <span>An independent community project. Not affiliated with local government or Flock Safety.</span>
          <span>TELL CITY, IN · 47586</span>
        </div>
      </footer>
    </div>
  );
}
