/**
 * Pure growth-funnel math. Turns raw platform counts into an ordered
 * acquisition→activation funnel with stage conversion rates, plus paid
 * conversion/churn. Kept IO-free so it is unit-testable; the service feeds it
 * counts from cheap, indexable queries (no JSON scanning).
 */

export interface FunnelInput {
  registered: number;
  verified: number;
  createdProject: number;
  /** Paid conversions — count of billing.subscription_activated audit events. */
  activated: number;
  /** Churn — count of billing.subscription_canceled audit events. */
  canceled: number;
}

export interface FunnelStage {
  id: 'registered' | 'verified' | 'created_project';
  label: string;
  count: number;
  pctOfRegistered: number | null;
  pctOfPrevious: number | null;
}

export interface FunnelReport {
  registered: number;
  stages: FunnelStage[];
  conversion: {
    activated: number;
    canceled: number;
    net: number;
    /** Activated as a percentage of registered users. */
    rate: number | null;
  };
}

/** Integer percentage of part/whole, or null when whole is zero. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function buildFunnel(input: FunnelInput): FunnelReport {
  const { registered, verified, createdProject, activated, canceled } = input;

  const stages: FunnelStage[] = [
    {
      id: 'registered',
      label: 'Registered',
      count: registered,
      pctOfRegistered: pct(registered, registered),
      pctOfPrevious: null,
    },
    {
      id: 'verified',
      label: 'Verified email',
      count: verified,
      pctOfRegistered: pct(verified, registered),
      pctOfPrevious: pct(verified, registered),
    },
    {
      id: 'created_project',
      label: 'Created a project',
      count: createdProject,
      pctOfRegistered: pct(createdProject, registered),
      pctOfPrevious: pct(createdProject, verified),
    },
  ];

  return {
    registered,
    stages,
    conversion: {
      activated,
      canceled,
      net: Math.max(0, activated - canceled),
      rate: pct(activated, registered),
    },
  };
}
