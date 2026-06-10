import { redirect } from "@sveltejs/kit";

export function load({ url }: { url: URL }) {
  throw redirect(307, `/system/observability${url.search}${url.hash}`);
}
