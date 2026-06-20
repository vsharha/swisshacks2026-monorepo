import { describe, expect, it } from "vitest";
import { isRetryableStatus, mapPool, withRetry } from "./pool.ts";

const noSleep = async (): Promise<void> => {};

describe("withRetry", () => {
  it("returns on the first success without retrying", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries then succeeds within the attempt budget", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("transient");
        return calls;
      },
      { retries: 3, sleep: noSleep },
    );
    expect(out).toBe(3);
  });

  it("stops early when shouldRetry is false", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("fatal");
        },
        { retries: 5, shouldRetry: () => false, sleep: noSleep },
      ),
    ).rejects.toThrow("fatal");
    expect(calls).toBe(1);
  });
});

describe("isRetryableStatus", () => {
  it("flags rate-limit and transient server errors", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("mapPool", () => {
  it("preserves order and respects the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const out = await mapPool(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return n * 2;
      },
      2,
    );
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
