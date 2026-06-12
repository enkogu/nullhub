import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params, url }) => {
  throw redirect(308, `/orders/workflows/runs/${encodeURIComponent(params.id)}/fork${url.search}${url.hash}`);
};
