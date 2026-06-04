import { describe, it, expect } from "vitest";
import { formatActivityLabel } from "@/lib/utils/activity-format";
import { buildT } from "@/lib/i18n/index";
import { en } from "@/lib/i18n/locales/en";

const t = buildT(en);

describe("formatActivityLabel", () => {
  it("renders a version-update label with from/to interpolation", () => {
    const label = formatActivityLabel(
      t,
      "SERVER_VERSION_UPDATED",
      "alice",
      { serverName: "mc-1", from: "1.21.4", to: "1.21.5" },
    );
    expect(label).toBe("alice updated server mc-1 from 1.21.4 to 1.21.5");
  });

  it("falls back to the raw action key for unknown actions", () => {
    const label = formatActivityLabel(t, "TOTALLY_UNKNOWN", "alice", {});
    expect(label).toBe("activity.actions.TOTALLY_UNKNOWN");
  });

  it("uses empty strings for missing detail fields", () => {
    const label = formatActivityLabel(t, "SERVER_STARTED", "bob", {});
    expect(label).toBe("bob started server ");
  });
});
