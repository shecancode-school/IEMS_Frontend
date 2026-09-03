import { describe, it, expect } from "vitest";
import { isLiveProgramme, programmeBlockedReason, type ProgrammeState } from "@/lib/programme";

const live: ProgrammeState = { status: "OPEN", isPublished: true, archivedAt: null };

describe("isLiveProgramme", () => {
  it("accepts a published, open, unarchived event", () => {
    expect(isLiveProgramme(live)).toBe(true);
  });

  /* Registration having closed does not make the programme dead: the people
     already holding a pass still need their dashboard and their reminders. */
  it("accepts a CLOSED event, which is still happening", () => {
    expect(isLiveProgramme({ ...live, status: "CLOSED" })).toBe(true);
  });

  it("rejects a draft", () => {
    expect(isLiveProgramme({ ...live, status: "DRAFT" })).toBe(false);
  });

  it("rejects an unpublished event", () => {
    expect(isLiveProgramme({ ...live, isPublished: false })).toBe(false);
  });

  it("rejects an archived event", () => {
    expect(isLiveProgramme({ ...live, archivedAt: new Date() })).toBe(false);
  });

  it("rejects a missing event", () => {
    expect(isLiveProgramme(null)).toBe(false);
    expect(isLiveProgramme(undefined)).toBe(false);
  });
});

describe("programmeBlockedReason", () => {
  it("is null exactly when the programme is live", () => {
    expect(programmeBlockedReason(live)).toBeNull();
    expect(programmeBlockedReason({ ...live, status: "CLOSED" })).toBeNull();
  });

  it("names the specific reason, so the message is actionable", () => {
    expect(programmeBlockedReason({ ...live, archivedAt: new Date() })).toMatch(/archived/i);
    expect(programmeBlockedReason({ ...live, isPublished: false })).toMatch(/published/i);
    expect(programmeBlockedReason({ ...live, status: "DRAFT" })).toMatch(/draft/i);
    expect(programmeBlockedReason(null)).toMatch(/no longer exists/i);
  });

  /* Archiving is the strongest signal, so it wins over "unpublished" when both
     are true — otherwise an archived draft would be reported as merely
     unpublished and someone would try to publish it. */
  it("reports archival ahead of the other reasons", () => {
    expect(
      programmeBlockedReason({ status: "DRAFT", isPublished: false, archivedAt: new Date() })
    ).toMatch(/archived/i);
  });

  it("agrees with isLiveProgramme on every combination", () => {
    for (const status of ["DRAFT", "OPEN", "CLOSED"] as const) {
      for (const isPublished of [true, false]) {
        for (const archivedAt of [null, new Date()]) {
          const e = { status, isPublished, archivedAt };
          expect(programmeBlockedReason(e) === null).toBe(isLiveProgramme(e));
        }
      }
    }
  });
});
