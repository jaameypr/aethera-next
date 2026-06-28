import { describe, it, expect } from "vitest";
import { PROJECT_LOG_ACTIONS } from "@/lib/db/models/project-log";

describe("PROJECT_LOG_ACTIONS", () => {
  it("includes SERVER_VERSION_UPDATED", () => {
    expect(PROJECT_LOG_ACTIONS).toContain("SERVER_VERSION_UPDATED");
  });
});
