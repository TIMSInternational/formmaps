import { firstPasswordProblem, PASSWORD_RULES } from "../passwordPolicy";

/**
 * Mirrors the backends' validatePasswordStrength / PasswordStrength.Validate: same checks, same
 * order (the first broken rule is the one reported), same special-character set.
 */
describe("passwordPolicy matches the server rule", () => {
  it.each([
    ["Ab1!", "min8"],
    ["abcdefg1!", "upper"],
    ["ABCDEFG1!", "lower"],
    ["Abcdefgh!", "digit"],
    ["Password1", "special"],          // the case every web form used to let through
    ["Activate1Now", "special"],
    ["short", "min8"],                 // order: length is reported first
    ["Password1!", null],
    ["Pässwörd1#", null],
    ["Abcdefg1~", null],
    ["Abcdefg1 ", "special"],          // a space is not special to the server
  ])("%p → %p", (password, expected) => {
    expect(firstPasswordProblem(password)).toBe(expected);
  });

  it("accepts every special character the server accepts, and only those", () => {
    for (const ch of "!@#$%^&*()_-+=[]{};:'\",.<>?/\\|`~") expect(firstPasswordProblem(`Abcdefg1${ch}`)).toBeNull();
    for (const ch of " €£§±") expect(firstPasswordProblem(`Abcdefg1${ch}`)).toBe("special");
  });

  it("lists the rules in the server's order", () => {
    expect(PASSWORD_RULES.map((r) => r.rule)).toEqual(["min8", "upper", "lower", "digit", "special"]);
  });
});
