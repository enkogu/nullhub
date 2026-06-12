import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  throw redirect(308, `/system/observability${url.search}${url.hash}`);
};
