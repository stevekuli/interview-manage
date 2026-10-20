import type { StageCount } from "./insights";
import { describe, expect, it } from "vitest";
import { computeInsights } from "./insights";

const byStage: StageCount[] = [
	{ status: "saved", count: 2 },
	{ status: "applied", count: 3 },
	{ status: "screening", count: 2 },
	{ status: "interview", count: 1 },
	{ status: "offer", count: 1 },
	{ status: "rejected", count: 2 },
];

describe("computeInsights", () => {
	it("totals every stage including rejected", () => {
		expect(computeInsights(byStage).total).toBe(11);
	});

	it("computes cumulative reach down the forward funnel", () => {
		const { funnel } = computeInsights(byStage);
		// saved reached = all forward stages = 2+3+2+1+1 = 9
		expect(funnel[0]?.reached).toBe(9);
		// offer reached = 1 (just the offer bucket)
		expect(funnel.at(-1)?.reached).toBe(1);
	});

	it("derives tile numbers (applied past saved, interviews, offers)", () => {
		const insights = computeInsights(byStage);
		expect(insights.appliedOn).toBe(7); // everything past saved
		expect(insights.interviews).toBe(2); // interview + offer
		expect(insights.offers).toBe(1);
		// reached screening (4 of 7 that got past saved) → 57%
		expect(insights.responseRate).toBe(57);
	});

	it("handles an empty pipeline without dividing by zero", () => {
		const empty = computeInsights([]);
		expect(empty.total).toBe(0);
		expect(empty.funnel[0]?.pct).toBe(0);
	});
});
