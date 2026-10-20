import { create } from "zustand/react";

// Session-scoped drafts for the application form, keyed per user and per application
// (applicationId === null means the "add application" sheet). Drafts live in memory only:
// they survive route navigation (e.g. leaving to create a resume and coming back) but are
// intentionally lost on a full page refresh — the UI must not promise refresh recovery.
// They are also wiped on sign-out so one account never sees another's draft.
type ApplicationFormDraft = { values: Record<string, unknown>; savedAt: number };

// Set before leaving the applications flow to create/import a resume; consumed when the user
// returns, so the sheet they left can be reopened with the draft intact.
type ResumeReturnContext = { userId: string; applicationId: string | null };

type ApplicationSessionState = {
	drafts: Record<string, ApplicationFormDraft>;
	resumeReturn: ResumeReturnContext | null;
	// One-shot marker: after returning from resume creation, reopen the sheet with the resume
	// section expanded so linking the new resume is the obvious next step.
	focusResumeFor: string | null;
	saveDraft: (userId: string, applicationId: string | null, values: Record<string, unknown>) => void;
	readDraft: (userId: string, applicationId: string | null) => ApplicationFormDraft | null;
	clearDraft: (userId: string, applicationId: string | null) => void;
	clearAll: () => void;
	setResumeReturn: (context: ResumeReturnContext) => void;
	consumeResumeReturn: (userId: string) => string | null | undefined;
	setFocusResumeFor: (applicationId: string) => void;
	consumeFocusResume: () => string | null;
};

export const draftKey = (userId: string, applicationId: string | null) => `${userId}:${applicationId ?? "new"}`;

export const useApplicationSessionStore = create<ApplicationSessionState>((set, get) => ({
	drafts: {},
	resumeReturn: null,
	focusResumeFor: null,

	saveDraft: (userId, applicationId, values) =>
		set((state) => ({
			drafts: { ...state.drafts, [draftKey(userId, applicationId)]: { values, savedAt: Date.now() } },
		})),

	readDraft: (userId, applicationId) => get().drafts[draftKey(userId, applicationId)] ?? null,

	clearDraft: (userId, applicationId) =>
		set((state) => {
			const key = draftKey(userId, applicationId);
			if (!(key in state.drafts)) return state;
			const drafts = { ...state.drafts };
			delete drafts[key];
			return { ...state, drafts };
		}),

	clearAll: () => set({ drafts: {}, resumeReturn: null, focusResumeFor: null }),

	setResumeReturn: (context) => set({ resumeReturn: context }),

	consumeResumeReturn: (userId) => {
		const pending = get().resumeReturn;
		if (!pending || pending.userId !== userId) return undefined;
		set({ resumeReturn: null });
		return pending.applicationId;
	},

	setFocusResumeFor: (applicationId) => set({ focusResumeFor: applicationId }),

	consumeFocusResume: () => {
		const appId = get().focusResumeFor;
		if (appId !== null) set({ focusResumeFor: null });
		return appId;
	},
}));
