import { beforeEach, describe, expect, it } from "vitest";
import { useApplicationSessionStore } from "./session-draft";

// The session draft store isolates per user, hands drafts back only to their owner, and wipes
// everything on sign-out — the guarantees the application form's draft restore relies on.
describe("application session draft store", () => {
	beforeEach(() => useApplicationSessionStore.getState().clearAll());

	it("keeps drafts isolated between users", () => {
		const store = useApplicationSessionStore.getState();
		store.saveDraft("user-1", null, { company: "Acme" });
		store.saveDraft("user-2", "app-9", { company: "Beta" });

		expect(useApplicationSessionStore.getState().readDraft("user-1", null)).toMatchObject({
			values: { company: "Acme" },
		});
		expect(useApplicationSessionStore.getState().readDraft("user-1", "app-9")).toBeNull();
		expect(useApplicationSessionStore.getState().readDraft("user-2", "app-9")).toMatchObject({
			values: { company: "Beta" },
		});
	});

	it("distinguishes the new-application draft from per-application drafts", () => {
		const store = useApplicationSessionStore.getState();
		store.saveDraft("user-1", null, { company: "Draft" });
		store.saveDraft("user-1", "app-1", { company: "Editing" });

		expect(useApplicationSessionStore.getState().readDraft("user-1", null)?.values.company).toBe("Draft");
		expect(useApplicationSessionStore.getState().readDraft("user-1", "app-1")?.values.company).toBe("Editing");

		useApplicationSessionStore.getState().clearDraft("user-1", null);
		expect(useApplicationSessionStore.getState().readDraft("user-1", null)).toBeNull();
		expect(useApplicationSessionStore.getState().readDraft("user-1", "app-1")).not.toBeNull();
	});

	it("clears every draft and pending return context on sign-out", () => {
		const store = useApplicationSessionStore.getState();
		store.saveDraft("user-1", null, { company: "Acme" });
		store.saveDraft("user-2", "app-1", { role: "Engineer" });
		store.setResumeReturn({ userId: "user-1", applicationId: null });

		store.clearAll();

		const next = useApplicationSessionStore.getState();
		expect(next.drafts).toEqual({});
		expect(next.resumeReturn).toBeNull();
	});

	it("hands the resume return context only to its owner and consumes it once", () => {
		const store = useApplicationSessionStore.getState();
		store.setResumeReturn({ userId: "user-1", applicationId: "app-7" });

		expect(useApplicationSessionStore.getState().consumeResumeReturn("user-2")).toBeUndefined();
		expect(useApplicationSessionStore.getState().consumeResumeReturn("user-1")).toBe("app-7");
		// Second read: already consumed.
		expect(useApplicationSessionStore.getState().consumeResumeReturn("user-1")).toBeUndefined();
	});

	it("supports the null application id for the unsaved new-application sheet", () => {
		const store = useApplicationSessionStore.getState();
		store.setResumeReturn({ userId: "user-1", applicationId: null });

		expect(useApplicationSessionStore.getState().consumeResumeReturn("user-1")).toBeNull();
	});
});
