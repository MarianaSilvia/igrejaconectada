import type { Express, Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database, Row, Query } from "./db.js";
import {
  token,
  hash,
  encrypt,
  decrypt,
  requireThat,
  passwordHash,
  passwordMatches,
  totpStep,
} from "./security.js";
import { audit } from "./seed.js";
type R = Request & { actor: Row; church: string };
const roles = z.enum(["admin", "secretary", "treasurer", "leader", "member"]);
export const openTotp = (value: string, key: Buffer) =>
  value.startsWith("enc:v1:") ? decrypt(value.slice(7), key) : value;
export async function sealTotpSecrets(db: Database, key: Buffer) {
  await db.transaction(async (q) => {
    const rows = await q(
      "SELECT id,totp_secret FROM users WHERE totp_secret IS NOT NULL AND totp_secret NOT LIKE 'enc:v1:%' FOR UPDATE",
    );
    for (const u of rows)
      await q("UPDATE users SET totp_secret=$2 WHERE id=$1", [
        u.id,
        "enc:v1:" + encrypt(u.totp_secret, key),
      ]);
  });
}
const newSecret = () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return Array.from(randomBytes(32), (n) => alphabet[n & 31]).join("");
};
export async function securityLimit(
  db: Database,
  key: string,
  maximum: number,
) {
  const n = await db.transaction(async (q) => {
    await q("DELETE FROM security_attempts WHERE until_at<now()");
    const [v] = await q(
      "INSERT INTO security_attempts(key_hash,attempts,until_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET attempts=security_attempts.attempts+1 RETURNING attempts",
      [hash(key)],
    );
    return v.attempts;
  });
  requireThat(n <= maximum, 429, "Muitas tentativas. Aguarde 15 minutos.");
}
export function accessRoutes(
  app: Express,
  db: Database,
  options: { key: Buffer; origin: string },
) {
  const route =
    (fn: (r: R, s: Response) => Promise<any>) =>
    (r: Request, s: Response, n: NextFunction) =>
      Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(fn, { actor: r.actor.id, church: r.church });
  };
  const admin = async (r: R) => {
    requireThat(r.actor?.mfa, 403, "Confirme MFA.");
    const [row] = await scoped(r, (q) =>
      q("SELECT local_role()='admin' AS allowed"),
    );
    requireThat(row.allowed, 403, "Administração local obrigatória.");
  };
  const logSecurity = (q: Query, r: R, action: string, scope: string, target: string | null, reason: string) =>
    q(
      "INSERT INTO security_change_log(church_id,target_id,action,scope,reason,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [r.church, target, action, scope, reason, r.actor.id, r.actor.name],
    );
  app.get(
    "/api/access",
    route(async (r, s) => {
      await admin(r);
      const params = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).parse(r.query);
      s.json(
        await db.transaction(async (q) => ({
          users: await q(
            "SELECT u.id,u.name,u.email,m.role,m.campus_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.church_id=$1 ORDER BY u.name",
            [r.church],
          ),
          permissions: await q(
            "SELECT user_id,action,allowed FROM action_permissions WHERE church_id=$1",
            [r.church],
          ),
          assignments: await q(
            "SELECT * FROM cell_assignments WHERE church_id=$1",
            [r.church],
          ),
          invites: await q(
            "SELECT id,name,email,role,expires_at,accepted_at,revoked_at FROM account_invites WHERE church_id=$1 ORDER BY expires_at DESC",
            [r.church],
          ),
          history: await q("SELECT id,action,scope,reason,actor_name,changed_at,target_id FROM security_change_log WHERE church_id=$1 ORDER BY changed_at DESC LIMIT $2 OFFSET $3", [r.church, params.pageSize, (params.page - 1) * params.pageSize]),
          historyPagination: await (async () => { const [row] = await q("SELECT count(*)::int AS total FROM security_change_log WHERE church_id=$1", [r.church]); return { total: Number(row.total), page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(row.total) / params.pageSize)) }; })(),
        })),
      );
    }),
  );
  app.put(
    "/api/access/permissions/:user",
    route(async (r, s) => {
      await admin(r);
      const user = z.uuid().parse(r.params.user),
        b = z
          .object({
            action: z.enum([
              "people.read",
              "people.write",
              "cells.read",
              "cells.write",
              "finance.read",
              "finance.write",
              "pastoral.read",
              "pastoral.write",
            ]),
            allowed: z.boolean().nullable(),
          })
          .parse(r.body);
      requireThat(
        user !== r.actor.id,
        400,
        "Use outro administrador para alterar suas permissões.",
      );
      await db.transaction(async (q) => {
        requireThat(
          (
            await q(
              "SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.church_id=$2 AND u.totp_secret IS NOT NULL",
              [user, r.church],
            )
          ).length,
          400,
          "Vínculo com MFA obrigatório.",
        );
        if (b.allowed === null)
          await q(
            "DELETE FROM action_permissions WHERE church_id=$1 AND user_id=$2 AND action=$3",
            [r.church, user, b.action],
          );
        else
          await q(
            "INSERT INTO action_permissions(church_id,user_id,action,allowed) VALUES($1,$2,$3,$4) ON CONFLICT(church_id,user_id,action) DO UPDATE SET allowed=excluded.allowed",
            [r.church, user, b.action, b.allowed],
          );
        await q("DELETE FROM sessions WHERE user_id=$1", [user]);
        await logSecurity(q, r, "permission-updated", b.action, user, b.allowed === null ? "Padrão da função restaurado." : b.allowed ? "Permissão concedida." : "Permissão negada.");
        await audit(q, r.actor.id, r.church, "access.permission-updated", user);
      });
      s.json({ ok: true });
    }),
  );
  app.put(
    "/api/access/cells/:cell/:user",
    route(async (r, s) => {
      await admin(r);
      const cell = z.uuid().parse(r.params.cell),
        user = z.uuid().parse(r.params.user),
        b = z
          .object({
            responsibility: z.enum(["leader", "supervisor"]).nullable(),
          })
          .parse(r.body);
      await db.transaction(async (q) => {
        requireThat(
          (
            await q(
              "SELECT 1 FROM cells c JOIN memberships m ON m.church_id=c.church_id JOIN users u ON u.id=m.user_id WHERE c.id=$1 AND c.church_id=$2 AND m.user_id=$3 AND m.role='leader' AND u.totp_secret IS NOT NULL AND (m.campus_id IS NULL OR m.campus_id=c.campus_id)",
              [cell, r.church, user],
            )
          ).length,
          400,
          "Célula e líder devem pertencer ao mesmo escopo.",
        );
        if (b.responsibility)
          await q(
            "INSERT INTO cell_assignments(church_id,cell_id,user_id,responsibility) VALUES($1,$2,$3,$4) ON CONFLICT(cell_id,user_id) DO UPDATE SET responsibility=excluded.responsibility",
            [r.church, cell, user, b.responsibility],
          );
        else
          await q(
            "DELETE FROM cell_assignments WHERE cell_id=$1 AND user_id=$2 AND church_id=$3",
            [cell, user, r.church],
          );
        await audit(q, r.actor.id, r.church, "cell.assignment-updated", cell);
        await logSecurity(q, r, "cell-assignment-updated", "cells", user, b.responsibility ? `Responsabilidade ${b.responsibility} atribuída.` : "Atribuição removida.");
      });
      s.json({ ok: true });
    }),
  );
  app.delete(
    "/api/access/users/:user",
    route(async (r, s) => {
      await admin(r);
      const user = z.uuid().parse(r.params.user);
      requireThat(
        user !== r.actor.id,
        400,
        "Não remova sua própria administração.",
      );
      await db.transaction(async (q) => {
        await q(
          "UPDATE operational_tasks SET assigned_to=NULL,version=version+1 WHERE assigned_to=$1 AND church_id=$2",
          [user, r.church],
        );
        await q(
          "UPDATE privacy_requests SET assigned_to=NULL,updated_at=now() WHERE assigned_to=$1 AND church_id=$2",
          [user, r.church],
        );
        await q(
          "DELETE FROM ministry_members WHERE user_id=$1 AND church_id=$2",
          [user, r.church],
        );
        await q(
          "DELETE FROM volunteer_unavailability WHERE user_id=$1 AND church_id=$2",
          [user, r.church],
        );
        requireThat(
          (
            await q(
              "DELETE FROM memberships WHERE user_id=$1 AND church_id=$2 RETURNING user_id",
              [user, r.church],
            )
          ).length,
          404,
          "Vínculo não encontrado.",
        );
        await q("DELETE FROM sessions WHERE user_id=$1", [user]);
        await q(
          "UPDATE access_grants SET revoked_at=now() WHERE user_id=$1 AND church_id=$2 AND revoked_at IS NULL",
          [user, r.church],
        );
        await logSecurity(q, r, "membership-removed", "people", user, "Vínculo local removido e sessões encerradas.");
        await audit(q, r.actor.id, r.church, "access.membership-removed", user);
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/access/invites",
    route(async (r, s) => {
      await admin(r);
      const b = z
          .object({
            name: z.string().trim().min(2).max(120),
            email: z.email().transform((v) => v.toLowerCase()),
            role: roles,
          })
          .parse(r.body),
        raw = token();
      const secret = newSecret();
      const id = await db.transaction(async (q) => {
        // Existing identities must prove control of their own session when accepting.
        const [i] = await q(
          "INSERT INTO account_invites(church_id,name,email,role,token_hash,encrypted_secret,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '48 hours',$7) RETURNING id",
          [
            r.church,
            b.name,
            b.email,
            b.role,
            hash(raw),
            encrypt(secret, options.key),
            r.actor.id,
          ],
        );
        await logSecurity(q, r, "invite-created", "account", i.id, `Convite criado para a função ${b.role}.`);
        await audit(q, r.actor.id, r.church, "account.invited", i.id);
        return i.id;
      });
      s.status(201).json({
        id,
        url: `${options.origin}/convite/${raw}`,
        delivery: "manual-private",
      });
    }),
  );
  app.delete(
    "/api/access/invites/:id",
    route(async (r, s) => {
      await admin(r);
      await db.transaction(async (q) => {
        requireThat(
          (
            await q(
              "UPDATE account_invites SET revoked_at=now() WHERE id=$1 AND church_id=$2 AND accepted_at IS NULL RETURNING id",
              [z.uuid().parse(r.params.id), r.church],
            )
          ).length,
          404,
          "Convite não encontrado.",
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "account.invite-revoked",
          String(r.params.id),
        );
        await logSecurity(q, r, "invite-revoked", "account", String(r.params.id), "Convite revogado antes do aceite.");
      });
      s.json({ ok: true });
    }),
  );
  const invite = async (q: Query, raw: string, lock = false) => {
    const [i] = await q(
      "SELECT * FROM account_invites WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL" +
        (lock ? " FOR UPDATE" : ""),
      [
        hash(
          z
            .string()
            .regex(/^[\w-]{43}$/)
            .parse(raw),
        ),
      ],
    );
    requireThat(i, 404, "Convite inválido, expirado ou já utilizado.");
    return i;
  };
  app.get(
    "/api/auth/invites/:token",
    route(async (r, s) => {
      s.json(
        await db.transaction(async (q) => {
          const i = await invite(q, String(r.params.token)),
            [u] = await q("SELECT id FROM users WHERE email=$1", [i.email]);
          return {
            name: i.name,
            email: i.email,
            existing: !!u,
            role: i.role,
            secret: u ? null : decrypt(i.encrypted_secret, options.key),
          };
        }),
      );
    }),
  );
  app.post(
    "/api/auth/invites/:token",
    route(async (r, s) => {
      await securityLimit(db, `invite:${r.ip}`, 30);
      const b = z
        .object({
          password: z.string().min(14).max(200).optional(),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(r.body);
      await db
        .transaction(async (q) => {
          const i = await invite(q, String(r.params.token), true);
          await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            i.email,
          ]);
          let [u] = await q("SELECT * FROM users WHERE email=$1 FOR UPDATE", [
            i.email,
          ]);
          if (u) {
            const cookie = (r.headers.cookie ?? "")
              .split(";")
              .map((v) => v.trim())
              .find((v) => v.startsWith("ecclesia_session="))
              ?.split("=")[1];
            const [session] = await q(
              "SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now() AND mfa=true",
              [hash(cookie ?? ""), u.id],
            );
            requireThat(
              session && !u.disabled_at,
              403,
              "Entre na sua conta com MFA antes de aceitar este vínculo.",
            );
          } else {
            requireThat(
              b.password && b.code,
              400,
              "Defina senha e confirme o autenticador.",
            );
            requireThat(
              i.attempts < 10,
              429,
              "Convite bloqueado. Peça um novo convite à administração.",
            );
            await q(
              "UPDATE account_invites SET attempts=attempts+1 WHERE id=$1",
              [i.id],
            );
            const secret = decrypt(i.encrypted_secret, options.key),
              step = totpStep(secret, b.code);
            if (step === null) return false;
            [u] = await q(
              "INSERT INTO users(email,name,password_hash,totp_secret,last_totp_step) VALUES($1,$2,$3,$4,$5) RETURNING id,name",
              [
                i.email,
                i.name,
                passwordHash(b.password),
                "enc:v1:" + encrypt(secret, options.key),
                step,
              ],
            );
          }
          requireThat(
            !(
              await q(
                "SELECT 1 FROM memberships WHERE user_id=$1 AND church_id=$2",
                [u.id, i.church_id],
              )
            ).length,
            409,
            "Já existe vínculo. Altere as permissões pela administração.",
          );
          await q(
            "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,$3)",
            [u.id, i.church_id, i.role],
          );
          await q("UPDATE account_invites SET accepted_at=now() WHERE id=$1", [
            i.id,
          ]);
          await q("DELETE FROM sessions WHERE user_id=$1", [u.id]);
          await audit(q, u.id, i.church_id, "account.invite-accepted", i.id);
          await q(
            "INSERT INTO security_change_log(church_id,target_id,action,scope,reason,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              i.church_id,
              i.id,
              "invite-accepted",
              "account",
              "Convite aceito e acesso configurado.",
              u.id,
              u.name,
            ],
          );
          return true;
        })
        .then((ok) => {
          requireThat(ok, 400, "Código do autenticador inválido.");
        });
      s.status(201).json({ ok: true });
    }),
  );
  app.post(
    "/api/account/password",
    route(async (r, s) => {
      const b = z
        .object({
          current: z.string().max(200),
          password: z.string().min(14).max(200),
        })
        .parse(r.body);
      await db.transaction(async (q) => {
        const [u] = await q("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          r.actor.id,
        ]);
        requireThat(
          passwordMatches(b.current, u.password_hash),
          403,
          "Senha atual incorreta.",
        );
        requireThat(!u.totp_secret || r.actor.mfa, 403, "Confirme MFA.");
        await q("UPDATE users SET password_hash=$2 WHERE id=$1", [
          u.id,
          passwordHash(b.password),
        ]);
        await q("DELETE FROM sessions WHERE user_id=$1", [u.id]);
        await q("DELETE FROM login_challenges WHERE user_id=$1", [u.id]);
        await audit(q, u.id, null, "account.password-updated");
      });
      s.json({ ok: true, signInRequired: true });
    }),
  );
  app.post(
    "/api/account/revoke-sessions",
    route(async (r, s) => {
      await db.transaction(async (q) => {
        await q("DELETE FROM sessions WHERE user_id=$1", [r.actor.id]);
        await audit(q, r.actor.id, null, "account.sessions-revoked");
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/access/recovery",
    route(async (r, s) => {
      await admin(r);
      const b = z
          .object({
            userId: z.uuid(),
            reason: z.string().trim().min(10).max(500),
          })
          .parse(r.body),
        raw = token();
      requireThat(
        b.userId !== r.actor.id,
        400,
        "Use sua senha ou os códigos de recuperação para sua própria conta.",
      );
      await db.transaction(async (q) => {
        const members = await q(
          "SELECT church_id FROM memberships WHERE user_id=$1",
          [b.userId],
        );
        requireThat(
          members.length === 1 &&
            members[0].church_id === r.church &&
            !(
              await q("SELECT 1 FROM network_members WHERE user_id=$1", [
                b.userId,
              ])
            ).length,
          403,
          "Conta compartilhada com outra unidade: recuperação deve ser feita pelo titular.",
        );
        await q("DELETE FROM account_recoveries WHERE user_id=$1", [b.userId]);
        await q(
          "INSERT INTO account_recoveries(token_hash,user_id,encrypted_reason,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
          [hash(raw), b.userId, encrypt(b.reason, options.key)],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "account.recovery-issued",
          b.userId,
        );
      });
      s.status(201).json({
        url: `${options.origin}/recuperar/${raw}`,
        delivery: "manual-private",
        requiresAuthenticator: true,
      });
    }),
  );
  app.post(
    "/api/auth/recovery/:token",
    route(async (r, s) => {
      await securityLimit(db, `recovery:${r.ip}`, 10);
      const b = z
        .object({
          password: z.string().min(14).max(200),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(r.body);
      const ok = await db.transaction(async (q) => {
        const [v] = await q(
          "SELECT r.*,u.totp_secret,u.last_totp_step FROM account_recoveries r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>now() AND u.disabled_at IS NULL FOR UPDATE",
          [hash(String(r.params.token))],
        );
        requireThat(v, 400, "Recuperação inválida ou expirada.");
        const step = v.totp_secret
          ? totpStep(openTotp(v.totp_secret, options.key), b.code ?? "")
          : null;
        if (
          v.totp_secret &&
          (step === null ||
            (v.last_totp_step !== null && step <= Number(v.last_totp_step)))
        )
          return false;
        await q(
          "UPDATE users SET password_hash=$2,last_totp_step=$3 WHERE id=$1",
          [v.user_id, passwordHash(b.password), step],
        );
        await q(
          "UPDATE account_recoveries SET used_at=now() WHERE token_hash=$1",
          [v.token_hash],
        );
        await q("DELETE FROM sessions WHERE user_id=$1", [v.user_id]);
        await q("DELETE FROM login_challenges WHERE user_id=$1", [v.user_id]);
        await audit(q, v.user_id, null, "account.password-recovered");
        return true;
      });
      requireThat(ok, 400, "Código inválido ou já utilizado.");
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/auth/recovery/:token",
    route(async (r, s) => {
      const [v] = await db.transaction((q) =>
        q(
          "SELECT u.totp_secret IS NOT NULL AS required FROM account_recoveries r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>now() AND u.disabled_at IS NULL",
          [hash(String(r.params.token))],
        ),
      );
      requireThat(v, 404, "Recuperação inválida ou expirada.");
      s.json({ requiresAuthenticator: v.required });
    }),
  );
  const setupMfa = async (q: Query, user: string) => {
    const raw = token(),
      secret = newSecret();
    await q("DELETE FROM mfa_changes WHERE user_id=$1", [user]);
    await q(
      "INSERT INTO mfa_changes(token_hash,user_id,encrypted_secret,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [hash(raw), user, encrypt(secret, options.key)],
    );
    return { challenge: raw, secret };
  };
  app.post(
    "/api/account/mfa/setup",
    route(async (r, s) => {
      const b = z.object({ password: z.string().max(200) }).parse(r.body);
      s.json(
        await db.transaction(async (q) => {
          const [u] = await q("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
            r.actor.id,
          ]);
          requireThat(
            passwordMatches(b.password, u.password_hash) &&
              (!u.totp_secret || r.actor.mfa),
            403,
            "Confirme sua senha e MFA.",
          );
          return setupMfa(q, u.id);
        }),
      );
    }),
  );
  app.post(
    "/api/auth/mfa-recovery",
    route(async (r, s) => {
      await securityLimit(db, `mfa-recovery:${r.ip}`, 10);
      const b = z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().max(200),
          backupCode: z.string().max(100),
        })
        .parse(r.body);
      s.json(
        await db.transaction(async (q) => {
          const [u] = await q(
            "SELECT * FROM users WHERE email=$1 AND disabled_at IS NULL FOR UPDATE",
            [b.email],
          );
          requireThat(
            u && passwordMatches(b.password, u.password_hash),
            403,
            "Credenciais de recuperação inválidas.",
          );
          const codes = await q(
            "DELETE FROM mfa_backup_codes WHERE user_id=$1 AND code_hash=$2 RETURNING code_hash",
            [u.id, hash(b.backupCode.trim())],
          );
          requireThat(
            codes.length,
            403,
            "Credenciais de recuperação inválidas.",
          );
          await audit(q, u.id, null, "account.mfa-recovery-started");
          return setupMfa(q, u.id);
        }),
      );
    }),
  );
  app.post(
    "/api/auth/mfa-confirm",
    route(async (r, s) => {
      await securityLimit(db, `mfa-confirm:${r.ip}`, 30);
      const b = z
        .object({
          challenge: z.string().min(40).max(100),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(r.body);
      const result = await db.transaction(async (q) => {
        const [v] = await q(
          "SELECT * FROM mfa_changes WHERE token_hash=$1 AND expires_at>now() AND attempts<5 FOR UPDATE",
          [hash(b.challenge)],
        );
        requireThat(v, 400, "Configuração expirada ou bloqueada.");
        await q(
          "UPDATE mfa_changes SET attempts=attempts+1 WHERE token_hash=$1",
          [v.token_hash],
        );
        const step = totpStep(decrypt(v.encrypted_secret, options.key), b.code);
        if (step === null) return null;
        await q(
          "UPDATE users SET totp_secret=$2,last_totp_step=$3 WHERE id=$1",
          [v.user_id, "enc:v1:" + v.encrypted_secret, step],
        );
        await q("DELETE FROM mfa_changes WHERE user_id=$1", [v.user_id]);
        await q("DELETE FROM sessions WHERE user_id=$1", [v.user_id]);
        await q("DELETE FROM login_challenges WHERE user_id=$1", [v.user_id]);
        await q("DELETE FROM mfa_backup_codes WHERE user_id=$1", [v.user_id]);
        const codes = Array.from({ length: 10 }, () =>
          randomBytes(12).toString("hex"),
        );
        for (const code of codes)
          await q("INSERT INTO mfa_backup_codes VALUES($1,$2)", [
            v.user_id,
            hash(code),
          ]);
        await audit(q, v.user_id, null, "account.mfa-rotated");
        return { backupCodes: codes };
      });
      requireThat(result, 400, "Código do autenticador inválido.");
      s.json(result);
    }),
  );
}
