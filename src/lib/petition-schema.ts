import { z } from "zod";

export const petitionSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(120).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Please enter a valid name."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  zip: z.literal("47586", { error: "This petition is for Tell City residents in ZIP code 47586." }),
  consent: z.literal(true, { error: "Please confirm your residency and support for the petition." }),
  website: z.string().max(0).optional(),
}).strict();

export const PETITION_VERSION = "2026-09-10-v1";
