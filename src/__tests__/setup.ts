/**
 * Global test setup — runs before all test suites.
 *
 * Mocks `server-only` so service imports don't throw at import time
 * (server-only is a build-time guard, not needed in tests).
 */
import { vi } from "vitest";

// server-only throws when imported outside of a React Server Component context.
// We mock it as a no-op so service files can be imported in tests.
vi.mock("server-only", () => ({}));
