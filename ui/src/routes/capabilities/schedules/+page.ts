import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  throw redirect(307, `/team/capabilities/schedules${url.search}${url.hash}`);
};
