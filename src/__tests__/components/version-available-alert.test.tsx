// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VersionAvailableAlert } from "@/components/admin/version-available-alert";

// Provide a real English `t` without the full LocaleProvider stack.
vi.mock("@/context/locale-context", async () => {
  const i18n = await vi.importActual<typeof import("@/lib/i18n/index")>(
    "@/lib/i18n/index",
  );
  const t = i18n.buildT(i18n.getTranslations("en"));
  return {
    useLocale: () => ({ locale: "en", t, setLocale: vi.fn(), isPending: false }),
  };
});

// Toasts have no DOM value here.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

// Radix Dialog needs portals/DOM; render children inline so assertions are simple.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
}));

function mockFetchStatus(status: Record<string, unknown>) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => status,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VersionAvailableAlert", () => {
  it("shows the banner with the latest version when an update is available", async () => {
    mockFetchStatus({
      updateAvailable: true,
      latest: "0.3.0",
      current: "0.2.0",
      changelog: "",
      mandatory: false,
    });

    render(<VersionAvailableAlert canUpdate={false} />);

    await waitFor(() => {
      expect(screen.getByText(/0\.3\.0/)).toBeInTheDocument();
    });
  });

  it("renders nothing when no update is available", async () => {
    mockFetchStatus({
      updateAvailable: false,
      latest: null,
      current: "0.2.0",
      changelog: "",
      mandatory: false,
    });

    const { container } = render(<VersionAvailableAlert canUpdate={false} />);

    // Give the one-shot effect a tick to resolve, then assert nothing rendered.
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
