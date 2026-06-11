import { error } from '@sveltejs/kit';

const validTabs = new Set(['today', 'live', 'results', 'activity']);

export function load({ params }: { params: { tab?: string } }) {
  const tab = params.tab || 'today';
  if (!validTabs.has(tab)) {
    throw error(404, 'Unknown Work tab');
  }
  return { tab };
}
