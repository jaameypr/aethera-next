// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JvmPresetSelector from "@/components/servers/JvmPresetSelector";

// Tooltip primitives use Radix which needs a DOM — just render children inline for tests
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <span>{children}</span>,
  TooltipContent: () => null,
}));

// ---------------------------------------------------------------------------
// Default props helper
// ---------------------------------------------------------------------------

function renderSelector(
  overrides: Partial<Parameters<typeof JvmPresetSelector>[0]> = {},
) {
  const onPresetChange = vi.fn();
  const onJavaArgsChange = vi.fn();

  render(
    <JvmPresetSelector
      memory={2048}
      selectedPresetId="g1gc-balanced"
      onPresetChange={onPresetChange}
      javaArgs=""
      onJavaArgsChange={onJavaArgsChange}
      {...overrides}
    />,
  );

  return { onPresetChange, onJavaArgsChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JvmPresetSelector", () => {
  it("renders all preset buttons", () => {
    renderSelector();
    expect(screen.getByText("Aikar's Flags")).toBeInTheDocument();
    expect(screen.getByText("G1GC Balanced")).toBeInTheDocument();
    expect(screen.getByText("ZGC (Java 17+)")).toBeInTheDocument();
    expect(screen.getByText("Minimal")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("Aikar's Flags button is grayed out (data-in-range=false) with memory=2048", () => {
    renderSelector({ memory: 2048 });
    const aikarsBtn = screen.getByText("Aikar's Flags").closest("button");
    expect(aikarsBtn).toBeDefined();
    expect(aikarsBtn!.dataset.inRange).toBe("false");
  });

  it("G1GC Balanced button is in-range with memory=2048", () => {
    renderSelector({ memory: 2048 });
    const btn = screen.getByText("G1GC Balanced").closest("button");
    expect(btn!.dataset.inRange).toBe("true");
  });

  it("clicking G1GC Balanced calls onPresetChange with its id", () => {
    const { onPresetChange } = renderSelector({ memory: 2048 });
    fireEvent.click(screen.getByText("G1GC Balanced"));
    expect(onPresetChange).toHaveBeenCalledOnce();
    expect(onPresetChange).toHaveBeenCalledWith("g1gc-balanced", expect.any(String));
  });

  it("does not show textarea when preset is not custom", () => {
    renderSelector({ selectedPresetId: "g1gc-balanced" });
    expect(screen.queryByPlaceholderText("-XX:+UseG1GC ...")).toBeNull();
  });

  it("shows textarea when selectedPresetId is custom", () => {
    renderSelector({ selectedPresetId: "custom" });
    expect(screen.getByPlaceholderText("-XX:+UseG1GC ...")).toBeInTheDocument();
  });

  it("calls onJavaArgsChange when textarea changes", () => {
    const { onJavaArgsChange } = renderSelector({
      selectedPresetId: "custom",
      javaArgs: "",
    });
    const ta = screen.getByPlaceholderText("-XX:+UseG1GC ...");
    fireEvent.change(ta, { target: { value: "-XX:+UseZGC" } });
    expect(onJavaArgsChange).toHaveBeenCalledWith("-XX:+UseZGC");
  });
});
