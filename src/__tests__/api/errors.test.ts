import { describe, it, expect } from "vitest";
import {
  VersionUpdateAvailableError,
  errorResponse,
  HttpError,
} from "@/lib/api/errors";

describe("VersionUpdateAvailableError", () => {
  it("is a 409 HttpError carrying current/latest and a code", () => {
    const err = new VersionUpdateAvailableError("1.21.3", "1.21.4");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("VERSION_UPDATE_AVAILABLE");
    expect(err.current).toBe("1.21.3");
    expect(err.latest).toBe("1.21.4");
  });

  it("serializes code, current and latest via errorResponse", async () => {
    const res = errorResponse(new VersionUpdateAvailableError("1.21.3", "1.21.4"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("VERSION_UPDATE_AVAILABLE");
    expect(body.current).toBe("1.21.3");
    expect(body.latest).toBe("1.21.4");
  });

  it("omits code for a plain HttpError", async () => {
    const res = errorResponse(new HttpError(400, "bad"));
    const body = await res.json();
    expect(body).toEqual({ error: "bad" });
  });
});
