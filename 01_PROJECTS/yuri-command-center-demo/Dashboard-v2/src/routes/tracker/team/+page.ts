// T.7.3 follow-up — /tracker/team folded into /tracker?view=team.
// Bookmarked URLs + Telegram deep-links still resolve.
import { redirect } from "@sveltejs/kit";
export const load = () => {
  throw redirect(308, "/tracker?view=team");
};
