// T.7.3 — /tracker/plan folded into /tracker?view=calendar.
// Existing Telegram digests + bookmarked URLs still work via 308.
import { redirect } from "@sveltejs/kit";
export const load = () => {
  throw redirect(308, "/tracker?view=calendar");
};
