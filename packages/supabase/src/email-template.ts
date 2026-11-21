export interface EmailTemplateValues {
  name: string;
  event_name?: string;
  event_date?: string;
  link?: string;
}

export function renderEmailTemplate(template: string, values: EmailTemplateValues): string {
  return template.replace(/\{(name|event_name|event_date|link)\}/g, (_, key: keyof EmailTemplateValues) => values[key] ?? "");
}

export function emailTemplateError(subject: string, body: string, hasEvent: boolean, hasLink: boolean): string | null {
  if (!subject.trim() || subject.trim().length > 160 || /[\r\n\t]/.test(subject) || !body.trim() || body.trim().length > 10000) {
    return "Enter a subject (up to 160 characters, one line) and message (up to 10,000 characters).";
  }
  const combined = subject + body;
  if (/[{}]/.test(combined.replace(/\{(name|event_name|event_date|link)\}/g, ""))) return "Use only {name}, {event_name}, {event_date} and {link} placeholders.";
  if (!hasEvent && /\{event_(name|date)\}/.test(combined)) return "Choose an event on the announcement before using event placeholders.";
  if (!hasLink && combined.includes("{link}")) return "Add a link to the announcement before using {link}.";
  return null;
}
