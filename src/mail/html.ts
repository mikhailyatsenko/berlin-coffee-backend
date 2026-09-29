/**
 * HTML built from a template: every interpolation is escaped, URLs included
 * (an escaped `&` in an href is what HTML expects), so user input cannot turn
 * into markup. A fragment built with `html` is already safe and goes in as is.
 */
export class SafeHtml {
  constructor(readonly value: string) {}

  toString() {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function html(
  strings: TemplateStringsArray,
  ...values: (string | number | SafeHtml)[]
): SafeHtml {
  let out = strings[0];
  values.forEach((value, i) => {
    out += value instanceof SafeHtml ? value.value : escape(String(value));
    out += strings[i + 1];
  });
  return new SafeHtml(out);
}
