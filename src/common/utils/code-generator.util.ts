// Same shape as the template's codeGenerator.ts: a 6-digit numeric OTP plus an
// expiry timestamp `minutesValid` minutes from now.
export function generateCode(minutesValid: number): { code: string; expiresAt: Date } {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + minutesValid * 60 * 1000);
  return { code, expiresAt };
}
