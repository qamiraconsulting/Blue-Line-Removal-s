import { describe, expect, it } from "vitest";
import { addressProblem, blankAddress, formatAddress, hasPostcode, isBlankAddress, looksLikeFullAddress, stateForPostcode } from "./address.js";

const full = { unitNumber: "4/12", street: "Station St", suburb: "Preston", state: "VIC", postcode: "3072" };

describe("full street addresses", () => {
  it("is written as one line the driver can search", () => {
    expect(formatAddress(full)).toBe("4/12 Station St, Preston VIC 3072");
    expect(formatAddress({ ...full, unitNumber: "  12 ", street: "Station   St" })).toBe("12 Station St, Preston VIC 3072");
  });

  it("says what is missing, in plain words", () => {
    expect(addressProblem(full)).toBeNull();
    expect(addressProblem({ ...full, unitNumber: "" }, "pick-up address")).toBe("Add the unit or house number for the pick-up address.");
    expect(addressProblem({ ...full, street: " " })).toContain("street name");
    expect(addressProblem({ ...full, suburb: "" })).toContain("suburb");
    expect(addressProblem({ ...full, state: "XX" })).toContain("state");
    expect(addressProblem({ ...full, postcode: "30" })).toContain("4-digit postcode");
    expect(addressProblem({ ...full, postcode: "3072A" })).toContain("4-digit postcode");
  });

  it("the website form needs only the suburb and postcode", () => {
    const short = { unitNumber: "", street: "", suburb: "Preston", state: "", postcode: "3072" };
    expect(addressProblem(short, "pick-up", { needStreet: false })).toBeNull();
    expect(addressProblem({ ...short, suburb: "" }, "pick-up", { needStreet: false })).toBe("Add the suburb for the pick-up.");
    expect(addressProblem({ ...short, postcode: "307" }, "pick-up", { needStreet: false })).toBe("Enter the 4-digit postcode for the pick-up.");
    expect(formatAddress({ ...short, state: "VIC" })).toBe("Preston VIC 3072");
  });

  it("works out the state from the postcode", () => {
    expect(stateForPostcode("3072")).toBe("VIC");
    expect(stateForPostcode("2000")).toBe("NSW");
    expect(stateForPostcode("2600")).toBe("ACT");
    expect(stateForPostcode("4000")).toBe("QLD");
    expect(stateForPostcode("5000")).toBe("SA");
    expect(stateForPostcode("6000")).toBe("WA");
    expect(stateForPostcode("7000")).toBe("TAS");
    expect(stateForPostcode("0800")).toBe("NT");
    expect(stateForPostcode("0000")).toBeNull();
    expect(stateForPostcode("30")).toBeNull();
  });

  it("knows a blank address from a half-filled one", () => {
    expect(isBlankAddress(blankAddress())).toBe(true);
    expect(isBlankAddress(undefined)).toBe(true);
    expect(isBlankAddress({ ...blankAddress(), suburb: "Preston" })).toBe(false);
  });

  it("the chat's free-text address needs a street number and a postcode", () => {
    expect(looksLikeFullAddress("4/12 Station St, Preston VIC 3072")).toBe(true);
    expect(looksLikeFullAddress("Unit 4, 12 Station Street Preston 3072")).toBe(true);
    expect(looksLikeFullAddress("Preston")).toBe(false);
    expect(looksLikeFullAddress("Preston VIC 3072")).toBe(false); // postcode only, no street number
    expect(looksLikeFullAddress("12 Station St, Preston")).toBe(false); // no postcode
    expect(hasPostcode("Preston VIC 3072")).toBe(true);
    expect(hasPostcode("Preston")).toBe(false);
  });
});
