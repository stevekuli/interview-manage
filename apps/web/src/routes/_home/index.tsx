import { ORPCError } from "@orpc/client";
import { ClientOnly, createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getResumeSocialMeta } from "@reactive-resume/resume/social-meta";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { NotFoundScreen } from "@/components/layout/not-found-screen";
import { Homepage } from "@/features/homepage/page";
import { orpc } from "@/libs/orpc/client";
import {
	createNoindexFollowMeta,
	createResumeSocialMeta,
	createRootStructuredDataScript,
	getCanonicalRootUrl,
} from "@/libs/seo";

const PublicResumePage = lazyRouteComponent(() => import("@/features/resume/public/public-resume"), "PublicResumePage");

export const Route = createFileRoute("/_home/")({
	component: RouteComponent,
	loader: async ({ context }) => ({
		root: await context.queryClient.fetchQuery(orpc.resume.getRoot.queryOptions({ staleTime: 0 })),
	}),
	onError: (error) => {
		if (error instanceof ORPCError && error.code === "NEED_PASSWORD") {
			const { username, slug } = error.data as { username: string; slug: string };
			throw redirect({ to: "/auth/resume-password", search: { redirect: `/${username}/${slug}`, returnTo: "/" } });
		}
	},
	head: ({ loaderData }) => {
		const root = loaderData?.root;
		if (root && root.status !== "disabled") {
			const { canonicalUrl } = root;
			if (root.status === "unavailable") {
				return {
					meta: [{ title: APP_NAME }, createNoindexFollowMeta()],
					links: [{ rel: "canonical", href: canonicalUrl }],
				};
			}
			const social = getResumeSocialMeta(root.resume.data, root.resume.name || "Resume");
			return {
				meta: [
					{ title: `${social.name} - ${APP_NAME}` },
					createNoindexFollowMeta(),
					...createResumeSocialMeta({
						canonicalUrl,
						title: social.title,
						description: social.description,
						imageUrl: `${canonicalUrl}opengraph/banner.jpg`,
					}),
				],
				links: [{ rel: "canonical", href: canonicalUrl }],
			};
		}
		const origin = typeof window !== "undefined" ? window.location.origin : undefined;
		const canonicalUrl = getCanonicalRootUrl(origin);

		return {
			...(canonicalUrl ? { links: [{ rel: "canonical", href: canonicalUrl }] } : {}),
			...(canonicalUrl ? { scripts: [createRootStructuredDataScript(canonicalUrl)] } : {}),
		};
	},
});

function RouteComponent() {
	const { flags } = Route.useRouteContext();
	const { root } = Route.useLoaderData();
	if (root.status === "unavailable")
		return (
			<main id="main-content">
				<NotFoundScreen />
			</main>
		);
	if (root.status === "public") {
		return (
			<ClientOnly fallback={<LoadingScreen />}>
				<PublicResumePage resume={root.resume} username={root.username} slug={root.slug} flags={flags} isRoot />
			</ClientOnly>
		);
	}

	return <Homepage />;
}
