// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  it("renders whitelist name, op name and op level badge", async () => {
    render(<PlayersTab serverId="srv1" serverStatus="running" />);

    expect(await screen.findByText("Steve")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    // Level badge for the op (level 3) — a <div>, distinct from the <option> in the
    // level select which carries the same text.
    const levelBadge = screen
      .getAllByText("Level 3")
      .find((el) => el.tagName === "DIV");
    expect(levelBadge).toBeDefined();
    expect(levelBadge).toBeInTheDocument();
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
});
