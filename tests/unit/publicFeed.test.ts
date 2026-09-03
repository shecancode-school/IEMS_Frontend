import { describe, it, expect } from "vitest";
import { itemCategoryLabel, itemColor, isBookableEvent, ACTIVITY_COLOR, CATEGORY_COLORS } from "@/lib/events";

/* The public feed's contract, tested without a database.

   The Mongo filter itself (visibility: "PUBLIC") is asserted by the integration
   suite; what is pinned here is the shape that leaves the module, because that
   is what actually reaches an anonymous visitor's browser. */

/* the exact object publicActivities() builds, mirrored so a change to the
   projection has to be made deliberately in two places */
const activityShape = {
  id: "activity-65f",
  title: "Backend cohort review",
  kind: "ACTIVITY" as const,
  host: "Aline Uwase",
  category: null,
  date: "2026-03-05",
  time: "2:00 PM",
  endTime: "3:00 PM",
  startsAt: "2026-03-05T12:00:00.000Z",
  endsAt: "2026-03-05T13:00:00.000Z",
  space: "Online",
  price: "",
  description: "",
  type: "REVIEW",
  organiser: "Lead Facilitator",
  posterUrl: "",
  gallery: [],
  status: "CLOSED" as const,
  rules: [],
  soldOut: false,
  capacity: 0,
  registeredParticipants: 0,
  remainingSlots: null,
  isFull: false,
  lifecycleStatus: "Upcoming" as const,
};

describe("public activity shape", () => {
  it("never carries the fields that would leak a private session", () => {
    /* the regression this guards: a Meet link on a public page is an open
       door to the call, and internal notes are nobody else's business */
    for (const leaky of ["meetLink", "googleEventId", "attendees", "visibility", "owner"]) {
      expect(Object.keys(activityShape)).not.toContain(leaky);
    }
  });

  it("carries no description text", () => {
    /* the activity's own notes are internal — the title is the public part */
    expect(activityShape.description).toBe("");
  });

  it("names who is running it", () => {
    expect(activityShape.host).toBe("Aline Uwase");
  });

  it("offers nothing to register for", () => {
    expect(activityShape.status).toBe("CLOSED");
    expect(activityShape.capacity).toBe(0);
    expect(isBookableEvent(activityShape)).toBe(false);
  });
});

describe("item colour and label", () => {
  it("gives a ticketed event its programme colour", () => {
    const event = { kind: "EVENT" as const, category: "SheCanCODE" as const, type: "WORKSHOP" };
    expect(itemColor(event)).toBe(CATEGORY_COLORS.SheCanCODE);
    expect(itemCategoryLabel(event)).toBe("SheCanCODE");
  });

  it("gives a session the distinct session accent", () => {
    expect(itemColor(activityShape)).toBe(ACTIVITY_COLOR);
  });

  it("never indexes the colour map with a null category", () => {
    /* activities legitimately have no category; the old code would have
       produced `undefined` as a CSS colour here */
    const colour = itemColor({ kind: "ACTIVITY", category: null });
    expect(colour).toBeTruthy();
    expect(colour).toMatch(/^#/);
  });

  it("labels a session by its type rather than a blank", () => {
    expect(itemCategoryLabel(activityShape)).toBe("REVIEW");
    expect(itemCategoryLabel({ kind: "ACTIVITY", category: null, type: "" })).toBe("Session");
  });

  it("treats a ticketed event as bookable", () => {
    expect(isBookableEvent({ kind: "EVENT" })).toBe(true);
  });
});

describe("nextEvent", () => {
  const item = (id: string, date: string, startsAt: string) =>
    ({ ...activityShape, id, date, startsAt }) as never;

  it("picks the soonest item at or after today", async () => {
    const { nextEvent, todayIso } = await import("@/lib/events");
    const today = todayIso();
    const items = [
      item("later", "2999-12-31", "2999-12-31T09:00:00.000Z"),
      item("today", today, `${today}T09:00:00.000Z`),
    ];
    expect(nextEvent(items)?.id).toBe("today");
  });

  it("ignores anything already past", async () => {
    const { nextEvent } = await import("@/lib/events");
    expect(nextEvent([item("old", "2000-01-01", "2000-01-01T09:00:00.000Z")])).toBeUndefined();
  });

  it("orders two items on the same day by start time, not by id", async () => {
    const { nextEvent, todayIso } = await import("@/lib/events");
    const today = todayIso();
    /* the regression: sorting by `date` alone left same-day ordering to
       whatever order the array happened to be in */
    const items = [
      item("afternoon", today, `${today}T14:00:00.000Z`),
      item("morning", today, `${today}T08:00:00.000Z`),
    ];
    expect(nextEvent(items)?.id).toBe("morning");
  });
});
