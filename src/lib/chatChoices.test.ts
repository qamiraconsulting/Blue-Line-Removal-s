import { describe, expect, it } from "vitest";
import { splitChoices } from "./chatChoices";

describe("chat tap-to-reply buttons", () => {
  it("takes the choices off the end of a message", () => {
    expect(splitChoices("What would you like to move?\n[[choices: Home | Apartment | Junk Removal]]")).toEqual({
      text: "What would you like to move?",
      choices: ["Home", "Apartment", "Junk Removal"],
    });
  });

  it("leaves ordinary messages alone, and ignores a marker that isn't at the end", () => {
    expect(splitChoices("Your estimate is $720.")).toEqual({ text: "Your estimate is $720.", choices: [] });
    expect(splitChoices("[[choices: A | B]] then more text").choices).toEqual([]);
  });

  it("drops empty options", () => {
    expect(splitChoices("Pick one [[choices: Card |  | Bank transfer ]]").choices).toEqual(["Card", "Bank transfer"]);
  });
});
