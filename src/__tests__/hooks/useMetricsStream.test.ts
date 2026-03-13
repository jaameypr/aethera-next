// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners: Record<string, ((e: Event) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: Event) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  removeEventListener(type: string, handler: (e: Event) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((h) => h !== handler);
  }

  dispatchMessage(data: object) {
    const ev = new MessageEvent("message", { data: JSON.stringify(data) });
    this.onmessage?.(ev);
  }

  dispatchOpen() {
    this.onopen?.(new Event("open"));
  }

  dispatchError() {
    const handlers = this.listeners["error"] ?? [];
    const ev = new Event("error");
    for (const h of handlers) h(ev);
    this.onerror?.(ev);
  }

  close() {}
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMetricsStream", () => {
  async function importHook() {
    const mod = await import("@/components/servers/MetricsCharts");
    // We need to export the hook separately — for now access it via the module
    // since MetricsCharts.tsx exports useMetricsStream as a named export.
    return mod;
  }

  function makeFrame(i: number) {
    return {
      ts: new Date(Date.now() + i * 1000).toISOString(),
      cpuPct: i * 1.0,
      ramUsed: i * 1024 * 1024,
      ramLimit: 4096 * 1024 * 1024,
      ramPct: (i / 40) * 100,
    };
  }

  it("accumulates 5 points from 5 SSE messages", async () => {
    const { useMetricsStream } = await import("@/components/servers/MetricsCharts");
    const { result } = renderHook(() => useMetricsStream("server-1"));

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    for (let i = 0; i < 5; i++) {
      act(() => es.dispatchMessage(makeFrame(i)));
    }

    expect(result.current.points).toHaveLength(5);
  });

  it("caps the buffer at 100 points after 101 messages", async () => {
    const { useMetricsStream } = await import("@/components/servers/MetricsCharts");
    const { result } = renderHook(() => useMetricsStream("server-2"));

    const es = MockEventSource.instances[0];

    for (let i = 0; i < 101; i++) {
      act(() => es.dispatchMessage(makeFrame(i)));
    }

    expect(result.current.points).toHaveLength(100);
  });

  it("sets connected=true on onopen", async () => {
    const { useMetricsStream } = await import("@/components/servers/MetricsCharts");
    const { result } = renderHook(() => useMetricsStream("server-3"));

    const es = MockEventSource.instances[0];
    expect(result.current.connected).toBe(false);

    act(() => es.dispatchOpen());

    expect(result.current.connected).toBe(true);
  });

  it("sets connected=false on error", async () => {
    const { useMetricsStream } = await import("@/components/servers/MetricsCharts");
    const { result } = renderHook(() => useMetricsStream("server-4"));

    const es = MockEventSource.instances[0];

    act(() => es.dispatchOpen());
    expect(result.current.connected).toBe(true);

    act(() => es.dispatchError());
    expect(result.current.connected).toBe(false);
  });
});
