// Confirmed users can receive an obfuscated success response from Supabase.
// An empty identities list means no new signup/code was created.
export function signupResult(result: any) {
  const user = result?.user || result;
  if (Array.isArray(user?.identities) && user.identities.length === 0) {
    throw Object.assign(new Error("Account already exists."), {
      code: "account_exists",
    });
  }
  return { sent: true };
}
