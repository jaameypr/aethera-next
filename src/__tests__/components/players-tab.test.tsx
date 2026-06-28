// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PlayersTab } from "@/components/servers/tabs/PlayersTab";

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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Dialog primitives use Radix portals — render them inline for jsdom.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const PAYLOAD = {
  running: true,
  whitelistEnabled: true,
  whitelist: [{ uuid: "uuid-steve", name: "Steve" }],
  ops: [{ uuid: "uuid-alex", name: "Alex", level: 3 }],
};

function mockFetchOnce(payload: unknown = PAYLOAD) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOnce());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PlayersTab", () => {
  it("renders whitelist name, op name and inline level select", async () => {
    render(<PlayersTab serverId="srv1" serverStatus="running" />);

    expect(await screen.findByText("Steve")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    // The op's level is now an inline <select> labelled "Level".
    const levelSelects = screen.getAllByRole("combobox", { name: /level/i });
    // There is at least one select in the ops list (the op row for Alex).
    // The ops-row select should have the current level (3) selected.
    const opsRowSelect = levelSelects.find(
      (el) => (el as HTMLSelectElement).value === "3",
    ) as HTMLSelectElement | undefined;
    expect(opsRowSelect).toBeDefined();
    expect(opsRowSelect).toBeInTheDocument();
  });

  it("shows the live status note when running", async () => {
    render(<PlayersTab serverId="srv1" serverStatus="running" />);
    expect(
      await screen.findByText(/changes apply live/i),
    ).toBeInTheDocument();
  });

  it("enables Add and POSTs to the whitelist endpoint for a valid username", async () => {
    const fetchMock = mockFetchOnce();
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayersTab serverId="srv1" serverStatus="running" />);
    await screen.findByText("Steve");

    // The whitelist add input is the first "Username" field.
    const inputs = screen.getAllByLabelText("Username");
    const whitelistInput = inputs[0];
    fireEvent.change(whitelistInput, { target: { value: "Notch" } });

    // First Add button belongs to the whitelist card.
    const addButtons = screen.getAllByRole("button", { name: /add/i });
    const whitelistAdd = addButtons[0];
    expect(whitelistAdd).not.toBeDisabled();

    fireEvent.click(whitelistAdd);

    await waitFor(() => {
      const calledWhitelistPost = fetchMock.mock.calls.some(
        ([url, opts]) =>
          url === "/api/servers/srv1/players/whitelist" &&
          (opts as RequestInit | undefined)?.method === "POST",
      );
      expect(calledWhitelistPost).toBe(true);
    });
  });

  it("keeps Add disabled and shows the hint for an invalid username", async () => {
    render(<PlayersTab serverId="srv1" serverStatus="running" />);
    await screen.findByText("Steve");

    const whitelistInput = screen.getAllByLabelText("Username")[0];
    fireEvent.change(whitelistInput, { target: { value: "bad name!" } });

    const whitelistAdd = screen.getAllByRole("button", { name: /add/i })[0];
    expect(whitelistAdd).toBeDisabled();
    expect(
      screen.getAllByText(/letters, numbers and underscores/i)[0],
    ).toBeInTheDocument();
  });

  it("clicking whitelist Remove opens the modal without immediately firing DELETE", async () => {
    const fetchMock = mockFetchOnce();
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayersTab serverId="srv1" serverStatus="running" />);
    await screen.findByText("Steve");

    // The initial GET has already happened — record call count.
    const callsBefore = fetchMock.mock.calls.length;

    // Click the Remove button on the Steve row (ghost icon button with aria-label "Remove").
    const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
    // First remove button belongs to the whitelist row (Steve).
    fireEvent.click(removeButtons[0]);

    // The confirm dialog should now be visible with the correct title.
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByText("Remove from Whitelist")).toBeInTheDocument();
    // The description should mention the player name.
    expect(screen.getAllByText(/Steve/).length).toBeGreaterThan(0);

    // No additional fetch calls should have been fired yet.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("clicking the destructive Remove in the dialog fires DELETE for whitelist", async () => {
    const fetchMock = vi.fn()
      // Initial GET
      .mockResolvedValueOnce({ ok: true, json: async () => PAYLOAD })
      // DELETE response
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...PAYLOAD, whitelist: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlayersTab serverId="srv1" serverStatus="running" />);
    await screen.findByText("Steve");

    // Open the modal.
    const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
    fireEvent.click(removeButtons[0]);

    // Click the destructive confirm button inside the dialog.
    // Use within() to scope the query to the dialog element only.
    const dialog = screen.getByTestId("dialog");
    const dialogRemoveBtn = within(dialog).getByRole("button", { name: /^Remove$/ });
    fireEvent.click(dialogRemoveBtn);

    await waitFor(() => {
      const calledDelete = fetchMock.mock.calls.some(
        ([url, opts]) =>
          (url as string).includes("/api/servers/srv1/players/whitelist/Steve") &&
          (opts as RequestInit | undefined)?.method === "DELETE",
      );
      expect(calledDelete).toBe(true);
    });
  });
});
