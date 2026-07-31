import type { Essay } from "../_components/types";

export function buildDraftPayload(draft: string): { currentDraft: string; status: Essay["status"] } {
  return { currentDraft: draft, status: draft ? "drafting" : "not_started" };
}

export function draftsFromEssays(essays: Essay[]): Record<string, string> {
  const drafts: Record<string, string> = {};
  essays.forEach((e) => { if (e.currentDraft) drafts[e.id] = e.currentDraft; });
  return drafts;
}
