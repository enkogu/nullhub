import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  throw redirect(308, `/team/capabilities/hooks${url.search}${url.hash}`);
};
