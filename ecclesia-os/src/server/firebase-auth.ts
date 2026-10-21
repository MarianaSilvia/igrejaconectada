import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

let authClient: ReturnType<typeof getAuth> | undefined;

function firebaseAdminAuth() {
  if (authClient) return authClient;
  let service: { projectId?: string; clientEmail?: string; privateKey?: string } = {};
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      service = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON inválido.");
    }
  } else {
    service = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    };
  }
  if (!service.projectId) {
    throw new Error("FIREBASE_PROJECT_ID não está configurado no servidor.");
  }
  const app = getApps().length
    ? getApps()[0]
    : service.clientEmail && service.privateKey
      ? initializeApp({
          credential: cert({
            projectId: service.projectId,
            clientEmail: service.clientEmail,
            privateKey: service.privateKey.replace(/\\n/g, "\n"),
          }),
        })
      : initializeApp({ projectId: service.projectId });
  authClient = getAuth(app);
  return authClient;
}

function hasServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const service = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as {
        projectId?: string;
        clientEmail?: string;
        privateKey?: string;
      };
      return Boolean(service.projectId && service.clientEmail && service.privateKey);
    } catch {
      return false;
    }
  }
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function firebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      (hasServiceAccount() || process.env.FIREBASE_WEB_API_KEY),
  );
}

function decodePayload(token: string): Record<string, any> {
  try {
    const segment = token.split(".")[1];
    if (!segment) return {};
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * Verifies an ID token with the Admin SDK when a service account is available.
 * AI Studio Firebase projects can be on the Starter plan, where service-account
 * creation is unavailable. In that case, Identity Toolkit's accounts:lookup
 * endpoint still validates the token server-side using the public web API key.
 */
async function verifyWithIdentityToolkit(
  token: string,
  projectId: string,
  apiKey: string,
): Promise<DecodedIdToken> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!response.ok) {
    throw new Error("Token Firebase inválido ou expirado.");
  }
  const payload = decodePayload(token);
  const body = (await response.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
      disabled?: boolean;
      providerUserInfo?: unknown[];
    }>;
  };
  const user = body.users?.[0];
  if (!user?.localId || user.localId !== payload.user_id && user.localId !== payload.sub) {
    throw new Error("Token Firebase não corresponde ao usuário.");
  }
  if (user.disabled) throw new Error("Conta Firebase desativada.");
  const now = Math.floor(Date.now() / 1000);
  return {
    ...payload,
    uid: user.localId,
    sub: user.localId,
    user_id: user.localId,
    email: user.email ?? payload.email,
    email_verified: Boolean(user.emailVerified),
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    iat: Number(payload.iat ?? now),
    auth_time: Number(payload.auth_time ?? now),
    exp: Number(payload.exp ?? now + 300),
    firebase: payload.firebase ?? { sign_in_provider: "password" },
  } as DecodedIdToken;
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  if (!token || token.length > 8192) throw new Error("Token Firebase ausente ou inválido.");
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID não está configurado no servidor.");
  if (hasServiceAccount()) {
    return firebaseAdminAuth().verifyIdToken(token, true);
  }
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY não está configurada no servidor.");
  return verifyWithIdentityToolkit(token, projectId, apiKey);
}
