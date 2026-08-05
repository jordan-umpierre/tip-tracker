export type AuthCredentials = {
  email: string;
  password: string;
};

export function readAuthCredentials(
  emailInput: string,
  passwordInput: string
): AuthCredentials {
  const email = emailInput.trim();
  if (
    email.length < 3 ||
    email.length > 254 ||
    /\s/.test(email) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) {
    throw new Error('Enter a valid email address.');
  }
  if (passwordInput.length < 1 || passwordInput.length > 1_024) {
    throw new Error('Enter your password.');
  }

  // Password whitespace can be intentional, so it is never trimmed.
  return { email, password: passwordInput };
}
