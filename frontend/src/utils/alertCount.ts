// S10: number on the teacher dashboard's Alerts tile = open (unresolved) alerts, NOT support-request rows
// (those have their own screen and must never inflate this badge).
export function openAlertCount(alerts: unknown): number {
  if (!Array.isArray(alerts)) return 0;
  return alerts.filter((a: any) => !a.resolved && a.alert_type !== 'support_request').length;
}
