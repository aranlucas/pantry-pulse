import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { confirmCount, fetchSnapshot } from "@/client/api";

describe("API error boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [{ error: "station error" }, 400, "station error"],
    [{ error: { message: "nested error" } }, 422, "nested error"],
    [{ message: "top error", error: { message: "nested error" } }, 400, "top error"],
    [{ message: 0, error: { message: "nested error" } }, 400, "Request failed (400)."],
    [null, 401, "That token did not unlock this pantry."],
  ])("retains message precedence and fallbacks for %j", async (body, status, message) => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(body), { status })));
    await expect(fetchSnapshot("test-token")).rejects.toThrow(message);
  });
});

type CapturedRequest = { url: string; method: string | undefined; body: unknown };

describe("count confirmation request", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only a compare-and-set count, never link fields that could clear a tag", async () => {
    const requests: CapturedRequest[] = [];
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      requests.push({
        url,
        method: init?.method,
        body: z.json().parse(JSON.parse(z.string().parse(init?.body))),
      });

      return Promise.resolve(new Response(JSON.stringify({ item: {} }), { status: 200 }));
    });

    await confirmCount("test-token", "itm/milk", 3);

    expect(requests).toEqual([
      {
        url: "/api/items/itm%2Fmilk/link",
        method: "POST",
        body: { onHand: 3, expectedQuantity: 3 },
      },
    ]);
  });
});
