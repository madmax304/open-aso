// DataForSEO credentials are confusing: an API login, an emailed API password,
// and a "Base64" combination of both. Users shouldn't have to know which is
// which, so we accept whatever they paste and normalize it to the Base64 key.
//
// Accepted input:
//   - the Base64 credential
//   - "login:password"
//   - the whole "Send by email" message from DataForSEO (or any text with an
//     email-style login and a password/Base64 value in it)

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const BASE64_TOKEN = /[A-Za-z0-9+/]{16,}={0,2}/g;

/** Returns the Base64 API key, or null if no credentials could be found. */
export function parseDataForSeoCredentials(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  // 1. A Base64 token that decodes to "login:password".
  for (const token of text.match(BASE64_TOKEN) ?? []) {
    if (decodesToLoginPassword(token)) return token;
  }

  // 2. A plain "login:password" pair.
  const pair = text.match(new RegExp(`(${EMAIL.source}):(\\S+)`, "i"));
  if (pair?.[1] && pair[2]) return encode(pair[1], pair[2]);

  // 3. Labelled fields, e.g. an email body with "API login: ..." and "API password: ...".
  const login = labelledValue(text, "login") ?? text.match(EMAIL)?.[0];
  const password = labelledValue(text, "password");
  if (login && password) return encode(login, password);

  return null;
}

export interface CredentialFields {
  /** DataForSEO's "API login": the account email. */
  email?: string;
  /** DataForSEO's "API password": the API key. */
  apiKey?: string;
  /** DataForSEO's "Base64" value: email and API key combined. */
  base64?: string;
}

export type ResolvedCredentials = { ok: true; key: string } | { ok: false; error: string };

/**
 * Turn whatever the user filled in into the Base64 key, with a clear error for
 * every way it can go wrong. Users may fill in email + API key, Base64 alone,
 * or all three; they may also paste the Base64 value into the API key field.
 */
export function resolveDataForSeoCredentials(fields: CredentialFields): ResolvedCredentials {
  const email = fields.email?.trim() || undefined;
  let apiKey = fields.apiKey?.trim() || undefined;
  let base64 = fields.base64?.trim() || undefined;

  // Base64 pasted into the API key field: treat it as Base64.
  if (apiKey && !base64 && decodesToLoginPassword(apiKey)) {
    base64 = apiKey;
    apiKey = undefined;
  }

  if (base64 && !decodesToLoginPassword(base64)) {
    return { ok: false, error: "The Base64 value doesn't look right. Copy it again from DataForSEO's email, or use your email and API key instead." };
  }

  const fromPair = email && apiKey ? encode(email, apiKey) : undefined;

  if (base64 && fromPair && base64 !== fromPair) {
    return { ok: false, error: "Your email and API key don't match your Base64 value. Use one option: either email + API key, or Base64 alone." };
  }

  const key = base64 ?? fromPair;
  if (key) return { ok: true, key };

  if (email && !apiKey) return { ok: false, error: "Missing your API key (DataForSEO labels it \"API password\")." };
  if (apiKey && !email) return { ok: false, error: "Missing the email address of your DataForSEO account (DataForSEO labels it \"API login\")." };
  return { ok: false, error: "No DataForSEO credentials found. Add your email and API key, or your Base64 value." };
}

/** Combine a login and API password into the Base64 key. */
export function encode(login: string, password: string): string {
  return Buffer.from(`${login.trim()}:${password.trim()}`).toString("base64");
}

function decodesToLoginPassword(token: string): boolean {
  const decoded = Buffer.from(token, "base64").toString("utf8");
  const [login, password] = splitOnce(decoded, ":");
  return Boolean(login && password && EMAIL.test(login) && /^[\x21-\x7e]+$/.test(password));
}

function labelledValue(text: string, label: string): string | undefined {
  const match = text.match(new RegExp(`${label}\\s*[:=]\\s*(\\S+)`, "i"));
  return match?.[1];
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  return index < 0 ? [value, ""] : [value.slice(0, index), value.slice(index + 1)];
}
