import { describe, it, expect } from "vitest";
import { eventFormSchema, richTextLength } from "@/schemas/admin";

/* The event form's validation rules.

   Worth testing rather than trusting to the UI, because two of them are the
   kind that silently stop applying: the end-after-start check lives in a
   `superRefine` that would be dropped the moment somebody `.extend()`s the
   schema, and the description check measures rendered text rather than the
   markup the editor actually produces. */

const VALID = {
  name: "Women in Tech Night",
  slug: "women-in-tech-night",
  category: "Mentorship",
  type: "WORKSHOP",
  startTime: "2026-10-01T18:00",
  endTime: "2026-10-01T21:00",
  gallery: ["https://res.cloudinary.com/demo/image/upload/poster.jpg"],
  organiser: "Igire Rwanda Organization",
  maxAttendees: 0,
  details: "<p>An evening of talks and mentorship for women building software.</p>",
  rules: [],
  price: "Free",
  location: "Main Hall, Kigali",
  mode: "IN_PERSON",
  host: "",
  isPublished: false,
  status: "DRAFT",
} as const;

function errorPaths(input: Record<string, unknown>): string[] {
  const result = eventFormSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join("."));
}

describe("richTextLength", () => {
  it("measures the text, not the markup", () => {
    expect(richTextLength("<p><strong>Hi</strong></p>")).toBe(2);
  });

  it("treats an empty editor as empty however it spells it", () => {
    /* what TipTap-style editors emit for "the user typed nothing" */
    for (const empty of ["", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>", "<p>   </p>"]) {
      expect(richTextLength(empty)).toBe(0);
    }
  });
});

describe("eventFormSchema", () => {
  it("accepts a fully filled event", () => {
    expect(eventFormSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires every field the form marks with an asterisk", () => {
    const blank = {
      ...VALID,
      name: "",
      slug: "",
      startTime: "",
      endTime: "",
      gallery: [],
      organiser: "",
      details: "",
      price: "",
      location: "",
    };
    const paths = errorPaths(blank);
    for (const field of [
      "name",
      "slug",
      "startTime",
      "endTime",
      "gallery",
      "organiser",
      "details",
      "price",
      "location",
    ]) {
      expect(paths, `${field} should be required`).toContain(field);
    }
  });

  it("leaves the host optional — an org-wide event has no one owner", () => {
    const { host: _host, ...withoutHost } = VALID;
    expect(eventFormSchema.safeParse(withoutHost).success).toBe(true);
  });

  it("rejects an end that is before the start", () => {
    expect(errorPaths({ ...VALID, endTime: "2026-10-01T17:00" })).toContain("endTime");
  });

  it("rejects an end equal to the start", () => {
    expect(errorPaths({ ...VALID, endTime: VALID.startTime })).toContain("endTime");
  });

  it("accepts an event that runs past midnight", () => {
    expect(
      eventFormSchema.safeParse({ ...VALID, endTime: "2026-10-02T01:00" }).success
    ).toBe(true);
  });

  it("rejects a description that is only markup", () => {
    expect(errorPaths({ ...VALID, details: "<p><br></p>" })).toContain("details");
  });

  it("keeps 0 capacity legal — it means uncapped", () => {
    expect(eventFormSchema.safeParse({ ...VALID, maxAttendees: 0 }).success).toBe(true);
    expect(errorPaths({ ...VALID, maxAttendees: -1 })).toContain("maxAttendees");
  });

  it("rejects a slug that is not url-safe", () => {
    expect(errorPaths({ ...VALID, slug: "Women In Tech" })).toContain("slug");
  });

  it("rejects a gallery entry that is not a url", () => {
    expect(errorPaths({ ...VALID, gallery: ["poster.jpg"] })).toContain("gallery.0");
  });
});
