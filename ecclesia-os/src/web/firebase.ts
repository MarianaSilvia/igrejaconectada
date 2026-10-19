import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  getDocFromServer,
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase with configuration from firebase-applet-config.json
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: "admin" | "member" | "pastor" | "leader";
  churchId?: string;
  status: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
}

// Error handling conformance with skill
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function translateFirebaseAuthError(err: any): string {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-credential":
      return "E-mail ou senha incorretos.";
    case "auth/user-not-found":
      return "Não encontramos nenhuma conta com este e-mail.";
    case "auth/wrong-password":
      return "Senha incorreta. Verifique e tente novamente.";
    case "auth/email-already-in-use":
      return "Este e-mail já está cadastrado no sistema. Faça login.";
    case "auth/weak-password":
      return "A senha é muito fraca. Digite pelo menos 6 caracteres.";
    case "auth/invalid-email":
      return "Por favor, informe um endereço de e-mail válido.";
    case "auth/missing-password":
      return "Por favor, digite sua senha.";
    case "auth/too-many-requests":
      return "Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.";
    case "auth/popup-closed-by-user":
      return "A autenticação com o Google foi cancelada antes de concluir.";
    case "auth/network-request-failed":
      return "Falha de conexão com a rede. Verifique sua internet e tente novamente.";
    case "auth/user-disabled":
      return "Esta conta foi desativada pelo administrador.";
    default:
      return err?.message || "Ocorreu um erro ao processar sua autenticação.";
  }
}

// Test connection on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
void testConnection();

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return cred.user;
}

export async function registerWithEmail(
  email: string,
  pass: string,
  name: string,
  role: "admin" | "member" = "member"
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = cred.user;

  // Save profile in Firestore
  const profile: UserProfile = {
    uid: user.uid,
    name: name.trim() || user.displayName || email.split("@")[0],
    email: user.email || email.trim(),
    role,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, "users", user.uid), profile, { merge: true });
    if (role === "admin") {
      await setDoc(doc(db, "admins", user.uid), {
        userId: user.uid,
        email: user.email,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
  }

  return user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function loginWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleAuthProvider);
  const user = cred.user;

  const userRef = doc(db, "users", user.uid);
  try {
    const existing = await getDoc(userRef);
    if (!existing.exists()) {
      const isOwner = user.email === "marianabsilva1987@gmail.com";
      const profile: UserProfile = {
        uid: user.uid,
        name: user.displayName || user.email?.split("@")[0] || "Usuário",
        email: user.email || "",
        role: isOwner ? "admin" : "member",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userRef, profile);
      if (isOwner) {
        await setDoc(doc(db, "admins", user.uid), {
          userId: user.uid,
          email: user.email,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
  }

  return user;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (e) {
    console.warn("Error fetching user profile:", e);
  }
  return null;
}

export async function syncFirstAdminProfile(user: User): Promise<UserProfile> {
  const isOwner = user.email === "marianabsilva1987@gmail.com";
  const profile: UserProfile = {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Administrador da Rede",
    email: user.email || "",
    role: "admin",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, "users", user.uid), profile, { merge: true });
    if (isOwner) {
      await setDoc(
        doc(db, "admins", user.uid),
        {
          userId: user.uid,
          email: user.email,
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }
  } catch (err) {
    console.warn("Could not save initial profile in Firestore:", err);
  }

  return profile;
}

export async function syncChurchToFirestore(church: {
  id: string;
  name: string;
  city?: string;
  state?: string;
  primaryColor?: string;
}): Promise<void> {
  const path = `churches/${church.id}`;
  try {
    await setDoc(
      doc(db, "churches", church.id),
      {
        id: church.id,
        name: church.name,
        city: church.city || "",
        state: church.state || "",
        primaryColor: church.primaryColor || "#7062db",
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncMemberToFirestore(
  churchId: string,
  member: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    role?: "member" | "leader" | "pastor";
    status?: "active" | "visitor" | "inactive";
    communion?: "active" | "disciplined" | "not_informed";
  },
): Promise<void> {
  const path = `churches/${churchId}/members/${member.id}`;
  try {
    await setDoc(
      doc(db, "churches", churchId, "members", member.id),
      {
        id: member.id,
        churchId,
        name: member.name,
        email: member.email || "",
        phone: member.phone || "",
        role: member.role || "member",
        status: member.status || "active",
        communion: member.communion || "active",
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncCellToFirestore(
  churchId: string,
  cell: {
    id: string;
    name: string;
    leader?: string;
    weekday?: string;
    time?: string;
    address?: string;
  },
): Promise<void> {
  const path = `churches/${churchId}/cells/${cell.id}`;
  try {
    await setDoc(
      doc(db, "churches", churchId, "cells", cell.id),
      {
        id: cell.id,
        churchId,
        name: cell.name,
        leader: cell.leader || "",
        weekday: cell.weekday || "",
        time: cell.time || "",
        address: cell.address || "",
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncTransactionToFirestore(
  churchId: string,
  tx: {
    id: string;
    description: string;
    amountCents: number;
    kind: "income" | "expense";
    category?: string;
    occurredOn?: string;
  },
): Promise<void> {
  const path = `churches/${churchId}/transactions/${tx.id}`;
  try {
    await setDoc(
      doc(db, "churches", churchId, "transactions", tx.id),
      {
        id: tx.id,
        churchId,
        description: tx.description,
        amountCents: Math.round(tx.amountCents),
        kind: tx.kind,
        category: tx.category || "",
        occurredOn: tx.occurredOn || new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncSaaSToFirestore(
  context: any,
  people?: any[],
): Promise<{ churchesCount: number; membersCount: number }> {
  let churchesCount = 0;
  let membersCount = 0;
  if (!context || !context.churches || !auth.currentUser) {
    return { churchesCount, membersCount };
  }

  for (const church of context.churches) {
    if (!church.id || !church.name) continue;
    try {
      await syncChurchToFirestore({
        id: church.id,
        name: church.name,
        city: church.city,
        state: church.state,
        primaryColor: church.primary_color,
      });
      churchesCount++;
    } catch (e) {
      console.warn("SaaS church sync to Firestore note:", e);
    }
  }

  if (Array.isArray(people)) {
    for (const p of people) {
      if (!p.id || !p.church_id || !p.name) continue;
      try {
        await syncMemberToFirestore(p.church_id, {
          id: p.id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          role: p.membership_type === "worker" ? "leader" : "member",
          status: p.status === "inactive" ? "inactive" : p.status === "visitor" ? "visitor" : "active",
        });
        membersCount++;
      } catch (e) {
        console.warn("SaaS member sync to Firestore note:", e);
      }
    }
  }

  return { churchesCount, membersCount };
}

export async function logoutFirebase(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };
