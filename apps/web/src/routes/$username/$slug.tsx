import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { RouterOutput } from "@/libs/orpc/client";
import { ORPCError } from "@orpc/client";
import { createFileRoute, lazyRouteComponent, notFound, redirect } from "@tanstack/react-router";
import { getResumeSocialMeta } from "@reactive-resume/resume/social-meta";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { orpc } from "@/libs/orpc/client";
import { createNoindexFollowMeta, createResumeSocialMeta, getCanonicalRootUrl } from "@/libs/seo";

type LoaderData = Omit<RouterOutput["resume"]["getBySlug"], "data"> & { data: ResumeData };

export const Route = createFileRoute("/$username/$slug")({
	ssr: "data-only",
	component: lazyRouteComponent(() => import("@/features/resume/public/public-resume"), "PublicResumeRoute"),
	loader: async ({ context, params }) => {
		const { username, slug } = params;
		const resume = await context.queryClient.ensureQueryData(
			orpc.resume.getBySlug.queryOptions({ input: { username, slug } }),
		);

		return { resume: resume as LoaderData };
	},
	head: ({ loaderData, params }) => {
		const resume = loaderData?.resume;
		const name = resume ? resume.data.basics.name || resume.name || "Resume" : APP_NAME;

		if (!resume) {
			return { meta: [{ title: `${name}` }, createNoindexFollowMeta()] };
		}

		const social = getResumeSocialMeta(resume.data, resume.name || "Resume");

		const base = getCanonicalRootUrl(typeof window === "undefined" ? undefined : window.location.origin);
		const canonicalUrl = base ? `${base}${params.username}/${params.slug}` : undefined;
		const imageUrl = `${base ?? "/"}opengraph/banner.jpg`;

		return {
			meta: [
				{ title: `${social.name} - ${APP_NAME}` },
				createNoindexFollowMeta(),
				...createResumeSocialMeta({
					canonicalUrl: canonicalUrl ?? "",
					title: social.title,
					description: social.description,
					imageUrl,
				}),
			],
			...(canonicalUrl ? { links: [{ rel: "canonical", href: canonicalUrl }] } : {}),
		};
	},
	onError: (error) => {
		if (error instanceof ORPCError && error.code === "NEED_PASSWORD") {
			const data = error.data as { username?: string; slug?: string } | undefined;
			const username = data?.username;
			const slug = data?.slug;

			if (username && slug) {
				throw redirect({
					to: "/auth/resume-password",
					search: { redirect: `/${username}/${slug}` },
				});
			}
		}

		throw notFound();
	},
});
