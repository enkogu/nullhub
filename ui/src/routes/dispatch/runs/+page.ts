import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  throw redirect(308, `/work/dispatch/runs${url.search}${url.hash}`);
};
