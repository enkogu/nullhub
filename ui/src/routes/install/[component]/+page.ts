import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params, url }) => {
  throw redirect(308, `/market/install/${encodeURIComponent(params.component)}${url.search}${url.hash}`);
};
