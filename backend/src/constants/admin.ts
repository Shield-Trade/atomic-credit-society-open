export const ADMIN_EMAILS = ["admin@example.com"] as const;

export function isAdminEmail(email: string) {
  return ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]);
}
