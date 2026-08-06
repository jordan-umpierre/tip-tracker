export type AuthCredentials = {
  email: string;
  password: string;
};

// The shortest password the app will submit when setting a new one. Supabase
// enforces its own minimum server-side; this exists so the user is told before
// a round trip, and it must not be looser than the project's setting or the
// provider rejects a password this file just called acceptable.
export const MINIMUM_NEW_PASSWORD_LENGTH = 8;

export type PasswordReset = {
  code: string;
  email: string;
  password: string;
};

export function readAuthCredentials(
  emailInput: string,
  passwordInput: string
): AuthCredentials {
  const email = readEmail(emailInput);
  if (passwordInput.length < 1 || passwordInput.length > 1_024) {
    throw new Error('Enter your password.');
  }

  // Password whitespace can be intentional, so it is never trimmed.
  return { email, password: passwordInput };
}

// The recovery form: the address the code was sent to, the code itself, and
// the password to set. All three are checked together because a reset that
// fails on the third field after accepting the first two wastes a code the
// user has to request again.
export function readPasswordReset(
  emailInput: string,
  codeInput: string,
  passwordInput: string
): PasswordReset {
  const email = readEmail(emailInput);

  // Supabase recovery codes are six digits. Trimmed because they are usually
  // pasted out of an email, and a trailing space is not a wrong code.
  const code = codeInput.trim();
  if (!/^[0-9]{6}$/.test(code)) {
    throw new Error('Enter the six-digit code from the email.');
  }

  if (passwordInput.length < MINIMUM_NEW_PASSWORD_LENGTH) {
    throw new Error(
      `Use a new password of at least ${MINIMUM_NEW_PASSWORD_LENGTH} characters.`
    );
  }
  if (passwordInput.length > 1_024) {
    throw new Error('That password is too long.');
  }

  return { code, email, password: passwordInput };
}

export function readEmail(emailInput: string): string {
  const email = emailInput.trim();
  if (
    email.length < 3 ||
    email.length > 254 ||
    /\s/.test(email) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}
