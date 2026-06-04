import { describe, it, expect } from "vitest";
import { en } from "@/lib/i18n/locales/en";
import { PROJECT_LOG_ACTIONS } from "@/lib/db/models/project-log";

describe("en i18n activity block", () => {
  it("has a label for every PROJECT_LOG_ACTION", () => {
    for (const action of PROJECT_LOG_ACTIONS) {
      expect(en.activity.actions[action as keyof typeof en.activity.actions]).toBeTypeOf("string");
    }
  });

  it("has the feed and bell UI strings", () => {
    expect(en.activity.feed.title).toBeTypeOf("string");
    expect(en.activity.feed.empty).toBeTypeOf("string");
    expect(en.activity.feed.loadMore).toBeTypeOf("string");
    expect(en.activity.bell.title).toBeTypeOf("string");
    expect(en.activity.bell.empty).toBeTypeOf("string");
    expect(en.activity.bell.viewAll).toBeTypeOf("string");
  });
});

import { de } from "@/lib/i18n/locales/de";

describe("de i18n activity block", () => {
  it("has the same activity keys as en", () => {
    const enKeys = Object.keys(en.activity.actions).sort();
    const deKeys = Object.keys(de.activity.actions).sort();
    expect(deKeys).toEqual(enKeys);
    expect(de.activity.feed.title).toBeTypeOf("string");
    expect(de.activity.bell.title).toBeTypeOf("string");
  });
});
