import { createInternalNeonAuth } from '@neondatabase/neon-js/auth';

const NEON_AUTH_URL = (import.meta.env.VITE_NEON_AUTH_URL ?? '').trim();

let neonAuthClient: ReturnType<typeof createInternalNeonAuth> | null = null;

function getNeonAuthClient() {
  if (NEON_AUTH_URL.length === 0) {
    throw new Error('VITE_NEON_AUTH_URL is required to use Neon authentication.');
  }

  if (!neonAuthClient) {
    neonAuthClient = createInternalNeonAuth(NEON_AUTH_URL);
  }

  return neonAuthClient;
}

type AdapterWithEmailAuth = {
  signUp: { email: (opts: { email: string; password: string; name: string }) => Promise<unknown> };
  signIn: { email: (opts: { email: string; password: string }) => Promise<unknown> };
  signOut: () => Promise<unknown>;
  getSession: () => Promise<unknown>;
};

export async function signUpWithEmail(email: string, password: string, name: string): Promise<void> {
  const auth = getNeonAuthClient();
  await (auth.adapter as unknown as AdapterWithEmailAuth).signUp.email({
    email,
    password,
    name,
  });
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const auth = getNeonAuthClient();
  await (auth.adapter as unknown as AdapterWithEmailAuth).signIn.email({
    email,
    password,
  });
}

export async function signOutAuth(): Promise<void> {
  const auth = getNeonAuthClient();
  await auth.adapter.signOut();
}

export async function getAuthJwtToken(): Promise<string | null> {
  const auth = getNeonAuthClient();
  return auth.getJWTToken();
}

export async function getAuthSessionEmail(): Promise<string | null> {
  const auth = getNeonAuthClient();
  const sessionResult = await auth.adapter.getSession();
  const maybeWrapped =
    typeof sessionResult === 'object' && sessionResult !== null && 'data' in sessionResult
      ? (sessionResult as { data?: unknown }).data
      : sessionResult;

  if (typeof maybeWrapped !== 'object' || maybeWrapped === null) {
    return null;
  }

  const user =
    'user' in maybeWrapped && typeof (maybeWrapped as { user?: unknown }).user === 'object'
      ? (maybeWrapped as { user?: { email?: unknown } }).user
      : null;

  if (user && typeof user.email === 'string' && user.email.length > 0) {
    return user.email;
  }

  return null;
}
