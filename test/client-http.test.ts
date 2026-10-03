import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSnapshot } from "../src/client/api";

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
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));
    await expect(fetchSnapshot("test-token")).rejects.toThrow(message);
  });
});
