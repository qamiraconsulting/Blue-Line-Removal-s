// Full street addresses (Ayesha, 2026-10-17): the driver must be able to find the pick-up with no
// guessing, so the chat collects unit/house number, street, suburb, state and postcode.
// The website quote form asks for the suburb and postcode only (Ayesha, 2026-10-26); the state is
// worked out from the postcode, and the team gets the street address when they call.
// Everything downstream (emails, the calendar, the driver's email, distances) keeps using
// ONE line of text -- formatAddress() -- so nothing else had to change.
// Shared by the website form (browser) and the server.

export const AU_STATES = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;
export type AuState = (typeof AU_STATES)[number];

export interface AddressParts {
  /** Unit and/or house number, e.g. "12" or "4/12". */
  unitNumber: string;
  /** Street name and type, e.g. "Station St". */
  street: string;
  suburb: string;
  state: string;
  postcode: string;
}

export const blankAddress = (): AddressParts => ({ unitNumber: "", street: "", suburb: "", state: "VIC", postcode: "" });

const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/** "4/12 Station St, Preston VIC 3072". */
export function formatAddress(a: AddressParts): string {
  const line1 = [clean(a.unitNumber), clean(a.street)].filter(Boolean).join(" ");
  const line2 = [clean(a.suburb), clean(a.state), clean(a.postcode)].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

/** True when nothing has been typed (so the address is simply not given). */
export const isBlankAddress = (a: Partial<AddressParts> | null | undefined) =>
  !a || [a.unitNumber, a.street, a.suburb, a.postcode].every((v) => !v || !v.trim());

/** The state an Australian postcode belongs to, or null when it isn't one. */
export function stateForPostcode(postcode: string): AuState | null {
  const p = clean(postcode);
  if (!/^\d{4}$/.test(p)) return null;
  const n = Number(p);
  if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return "ACT";
  if (n >= 800 && n <= 999) return "NT";
  if (n >= 1000 && n <= 2999) return "NSW";
  if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return "VIC";
  if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return "QLD";
  if (n >= 5000 && n <= 5999) return "SA";
  if (n >= 6000 && n <= 6999) return "WA";
  if (n >= 7000 && n <= 7999) return "TAS";
  return null;
}

/**
 * What's missing or wrong, in plain words, or null when it is complete. With needStreet false
 * (the website form) only the suburb and postcode are needed.
 */
export function addressProblem(a: AddressParts, label = "address", opts: { needStreet?: boolean } = {}): string | null {
  const needStreet = opts.needStreet ?? true;
  if (needStreet && !clean(a.unitNumber)) return `Add the unit or house number for the ${label}.`;
  if (needStreet && !clean(a.street)) return `Add the street name for the ${label}.`;
  if (!clean(a.suburb)) return `Add the suburb for the ${label}.`;
  if (!needStreet) return /^\d{4}$/.test(clean(a.postcode)) ? null : `Enter the 4-digit postcode for the ${label}.`;
  if (!(AU_STATES as readonly string[]).includes(a.state)) return `Choose the state for the ${label}.`;
  if (!/^\d{4}$/.test(clean(a.postcode))) return `Enter the 4-digit postcode for the ${label}.`;
  return null;
}

/** An Australian postcode written anywhere in the text. */
export const hasPostcode = (text: string) => /\b\d{4}\b/.test(text);

/**
 * A free-text address (the chat's) that looks complete enough to find: a street number
 * somewhere, and a postcode. Not a validity check -- just stops "Preston" being passed on.
 */
export function looksLikeFullAddress(text: string): boolean {
  const t = text.trim();
  if (!hasPostcode(t)) return false;
  // a number that is not the postcode: 12, 4/12, 12A, Unit 4
  const withoutPostcode = t.replace(/\b\d{4}\b(?!.*\b\d{4}\b)/, " ");
  return /\d/.test(withoutPostcode);
}
