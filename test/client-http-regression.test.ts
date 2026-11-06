import { afterEach, expect, it, vi } from "vitest";
import { fetchSnapshot } from "@/client/api";

afterEach(() => vi.unstubAllGlobals());

it("rejects malformed successful JSON instead of inventing an empty pantry", async () => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>upstream failure</html>")));
  await expect(fetchSnapshot("test-token")).rejects.toMatchObject({ status: 502 });
});
