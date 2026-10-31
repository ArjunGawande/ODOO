import { Badge } from '@/components/ui';
import { planAvailability } from '@backend/services/plans';

const AVAILABILITY = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  on_sale: { label: 'On sale', tone: 'success' },
  ended: { label: 'Ended', tone: 'neutral' },
};

/** An archived plan can't be sold, so it never shows as on sale. */
export function PlanAvailabilityBadge({ plan, today }) {
  if (!plan.is_active) return <Badge tone="warning">Archived</Badge>;
  const { label, tone } = AVAILABILITY[planAvailability(plan, today)];
  return <Badge tone={tone}>{label}</Badge>;
}
