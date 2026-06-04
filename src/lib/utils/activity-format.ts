import type { TFunction } from "@/lib/i18n/index";

/**
 * Render a localized activity-log label. Maps a log entry's `details` map onto
 * the `{interpolation}` placeholders used by the `activity.actions.*` strings.
 */
export function formatActivityLabel(
  t: TFunction,
  action: string,
  actorUsername: string,
  details: Record<string, unknown>,
): string {
  const vars: Record<string, string | number> = {
    actor: actorUsername,
    server: String(details.serverName ?? details.server ?? ""),
    member: String(details.memberUsername ?? details.member ?? ""),
    role: String(details.role ?? ""),
    from: String(details.from ?? ""),
    to: String(details.to ?? ""),
  };
  return t(`activity.actions.${action}`, vars);
}
