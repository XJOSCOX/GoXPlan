export async function hashPassword(password: string, salt?: string) {
  const passwordSalt = salt ?? crypto.randomUUID();
  const encoded = new TextEncoder().encode(`${passwordSalt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, salt: passwordSalt };
}
