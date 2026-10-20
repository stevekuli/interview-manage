import type { RouterOutput } from "@/libs/orpc/client";

export type Application = RouterOutput["applications"]["list"][number];

// getById additionally returns the server-derived validity of the stored match score.
export type ApplicationAiScore = NonNullable<RouterOutput["applications"]["getById"]["aiScore"]>;

// Detail-sheet data: the list row plus (once loaded) the aiScore verdict. The list row is used
// as optimistic initial data, so aiScore is optional here.
export type ApplicationDetail = Application & { aiScore?: ApplicationAiScore | null };
