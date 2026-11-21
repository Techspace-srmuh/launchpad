import { describe, expect, it } from "vitest";
import { emailTemplateError, renderEmailTemplate } from "./email-template";

describe("email personalization", () => {
  it("fills repeated names, event data and shared links in a single pass", () => {
    expect(renderEmailTemplate("Hello {name}, {event_name} on {event_date}: {link}. Thanks {name}!", { name: "Harsh", event_name: "TechSprint", event_date: "20 Nov 2026", link: "https://drive.google.com/example" }))
      .toBe("Hello Harsh, TechSprint on 20 Nov 2026: https://drive.google.com/example. Thanks Harsh!");
  });
  it("never treats names as executable templates or HTML", () => {
    expect(renderEmailTemplate("Hello {name}", { name: "<b>{link}</b>", link: "SECRET" })).toBe("Hello <b>{link}</b>");
  });
  it("rejects unsupported placeholders and missing required data", () => {
    expect(emailTemplateError("Hello", "{password}", true, true)).toContain("Use only");
    expect(emailTemplateError("{event_name}", "Hi", false, true)).toContain("Choose an event");
    expect(emailTemplateError("Hello", "{link}", false, false)).toContain("Add a link");
    expect(emailTemplateError("Hello\nBCC: other", "Hi", true, true)).toContain("one line");
    expect(emailTemplateError("Hello", "Hi {name}", false, false)).toBeNull();
  });
});
