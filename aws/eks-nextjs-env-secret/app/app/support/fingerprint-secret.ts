import crypto from "node:crypto";

export function fingerprintSecret(value: string) {
  if (value.length === 0) {
    return "unset";
  }

  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}
