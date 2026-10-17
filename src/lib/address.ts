// Full street addresses (Ayesha, 2026-10-17): the driver must be able to find the pick-up with no
// guessing, so the quote form and the chat collect unit/house number, street, suburb, state and
// postcode. Everything downstream (emails, the calendar, the driver's email, distances) keeps
// using ONE line of text -- formatAddress() -- so nothing else had to change.
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

/** What's missing or wrong, in plain words, or null when it is a complete address. */
export function addressProblem(a: AddressParts, label = "address"): string | null {
  if (!clean(a.unitNumber)) return `Add the unit or house number for the ${label}.`;
  if (!clean(a.street)) return `Add the street name for the ${label}.`;
  if (!clean(a.suburb)) return `Add the suburb for the ${label}.`;
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
