import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  throw redirect(308, `/orders/loops/library${url.search}${url.hash}`);
};
