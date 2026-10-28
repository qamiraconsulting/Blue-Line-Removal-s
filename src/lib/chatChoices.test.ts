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

  it("a marker on its own line with a sentence after it still gives buttons, and keeps the sentence", () => {
    const reply = "Sorry, 9:00am isn't free. These arrival times are free:\n\n[[choices: 7:30am | 12:00pm]]\n\nYou can also name another time and I'll check it.";
    expect(splitChoices(reply)).toEqual({
      text: "Sorry, 9:00am isn't free. These arrival times are free:\n\nYou can also name another time and I'll check it.",
      choices: ["7:30am", "12:00pm"],
    });
  });

  it("drops empty options", () => {
    expect(splitChoices("Pick one [[choices: Card |  | Bank transfer ]]").choices).toEqual(["Card", "Bank transfer"]);
  });
});
