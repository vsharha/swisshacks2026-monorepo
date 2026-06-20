import { describe, expect, it } from "vitest";
import {
  treasuryEventToSignals,
  walletGraphElements,
  walletScreeningToSignals,
  WalletScreeningSchema,
  TreasuryEventSchema,
} from "./chain.ts";

describe("walletScreeningToSignals", () => {
  it("emits an ownership sanctions hit for a sanctioned counterparty", () => {
    const screening = WalletScreeningSchema.parse({
      entityId: "gulf-bridge-capital",
      address: "bc1qsanctioned",
      chain: "bitcoin",
      sanctionedCounterparties: ["OFAC-listed mixer"],
      sourceUrl: "https://chain.example/wallet/1",
    });
    const out = walletScreeningToSignals(screening, "2026-06-20");
    const ownership = out.find((s) => s.axis === "ownership")!;
    expect(ownership.type).toBe("sanctioned_wallet");
    expect(ownership.source).toBe("chain");
    expect(ownership.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("emits a reputation signal only when illicit exposure crosses the threshold", () => {
    const high = WalletScreeningSchema.parse({
      entityId: "e1",
      address: "0xabc",
      chain: "ethereum",
      exposure: { mixer: 0.7 },
      sourceUrl: "https://chain.example/wallet/2",
    });
    expect(walletScreeningToSignals(high, "2026-06-20").some((s) => s.type === "illicit_flow_exposure")).toBe(true);

    const clean = WalletScreeningSchema.parse({
      entityId: "e1",
      address: "0xdef",
      chain: "ethereum",
      exposure: { mixer: 0.05 },
      sourceUrl: "https://chain.example/wallet/3",
    });
    expect(walletScreeningToSignals(clean, "2026-06-20")).toEqual([]);
  });
});

describe("treasuryEventToSignals", () => {
  it("routes a treasury shift to business_model and scale", () => {
    const event = TreasuryEventSchema.parse({
      entityId: "strategy",
      asset: "BTC",
      kind: "shift_to",
      magnitudeUsd: 250_000_000,
      date: "2026-05-01",
      sourceUrl: "https://chain.example/treasury/strategy",
      title: "Moved $250M of treasury into Bitcoin.",
    });
    const out = treasuryEventToSignals(event);
    expect(out.map((s) => s.axis).sort()).toEqual(["business_model", "scale"]);
    expect(out.every((s) => s.source === "chain")).toBe(true);
  });
});

describe("walletGraphElements", () => {
  it("builds a wallet node and TRANSACTS_WITH edges to sanctioned counterparties", () => {
    const screening = WalletScreeningSchema.parse({
      entityId: "gulf-bridge-capital",
      address: "bc1qx",
      chain: "bitcoin",
      sanctionedCounterparties: ["Lazarus mixer"],
      sourceUrl: "https://chain.example/wallet/4",
    });
    const { nodes, edges } = walletGraphElements(screening, "Gulf Bridge Capital Ltd");
    expect(nodes.some((n) => n.type === "wallet" && n.id === "wallet:bc1qx")).toBe(true);
    expect(edges.some((e) => e.from === "org:gulf bridge capital ltd" && e.type === "TRANSACTS_WITH")).toBe(true);
    expect(edges.some((e) => e.to === "wallet:lazarus mixer")).toBe(true);
  });
});
