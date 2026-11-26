/** The organization the site opens on when no other one is selected. */
export const DEFAULT_ORG = "MicroClub-USTHB";

/** GitHub org logins: alphanumerics and single inner hyphens, max 39 chars. */
const ORG_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export const isValidOrgLogin = (value: string): boolean => ORG_PATTERN.test(value);
