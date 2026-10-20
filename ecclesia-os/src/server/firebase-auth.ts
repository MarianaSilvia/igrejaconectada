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

export function firebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY),
  );
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  if (!token || token.length > 8192) throw new Error("Token Firebase ausente ou inválido.");
  return firebaseAdminAuth().verifyIdToken(token, true);
}
