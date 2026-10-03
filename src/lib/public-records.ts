const recordUrl = (filename: string) =>
  `/public%20records/${filename.split("/").map(encodeURIComponent).join("/")}`;

export const tcpdPolicy = {
  label: "ALPR policy",
  detail: "Effective August 25, 2026 · PDF",
  href: recordUrl("TCPD - ALPR Policy.pdf"),
};

export const tcpdBriefing = {
  label: "Common Council briefing",
  detail: "September 2026 · PDF",
  href: recordUrl("TCPD - Tell City Flock ALPR Council Briefing.pptx.pdf"),
};

export const tcpdRecords = [
  tcpdPolicy,
  {
    label: "Employee policy acknowledgment form",
    detail: "Blank acknowledgment form · PDF",
    href: recordUrl("TCPD - ALPR (Flock) Policy Acknowledgment.pdf"),
  },
  {
    label: "Original Flock agreement",
    detail: "2021 agreement · PDF",
    href: recordUrl("TCPD - Flock Original Contract.pdf"),
  },
  tcpdBriefing,
  {
    label: "Invoice INV-3352",
    detail: "November 1, 2022 · PDF",
    href: recordUrl("Invoices (5)/Flock Safety_INV-3352_2022-11-01.pdf"),
  },
  {
    label: "Invoice INV-21951",
    detail: "October 12, 2023 · PDF",
    href: recordUrl("Invoices (5)/Flock Safety_INV-21951_2023-10-12.pdf"),
  },
  {
    label: "Invoice INV-33310",
    detail: "February 15, 2024 · PDF",
    href: recordUrl("Invoices (5)/Flock Safety_INV-33310_2024-02-15 (1).pdf"),
  },
];
