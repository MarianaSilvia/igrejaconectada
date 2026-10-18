import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { audit } from "./seed.js";
import { requireThat } from "./security.js";

type R = Request & { actor: Row; church: string };
export function assemblyRoutes(app: Express, db: Database) {
  const route=(fn:(r:R,s:Response)=>Promise<unknown>)=>(r:Request,s:Response,n:NextFunction)=>Promise.resolve(fn(r as R,s)).catch(n);
  const scoped=<T>(r:R,fn:(q:Query)=>Promise<T>)=>db.transaction(fn,{actor:r.actor.id,church:r.church});
  const id=z.uuid();
  const networkForActor=async(r:R)=>{const [v]=await db.transaction(q=>q("SELECT c.network_id FROM churches c JOIN memberships m ON m.church_id=c.id WHERE m.user_id=$1 AND c.id=$2 UNION SELECT network_id FROM network_members WHERE user_id=$1 ORDER BY network_id LIMIT 1",[r.actor.id,r.church]));return v?.network_id as string|undefined;};
  app.get("/api/assemblies", route(async (r, s) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    const params = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(r.query);
    const networkId = await networkForActor(r);
    requireThat(networkId, 403, "Você não possui vínculo com esta rede.");
    const result = await db.transaction(async (q) => {
      const [total] = await q("SELECT count(*)::int AS total FROM convention_assemblies WHERE network_id=$1", [networkId]);
      const assemblies = await q("SELECT * FROM convention_assemblies WHERE network_id=$1 ORDER BY scheduled_on DESC,id DESC LIMIT $2 OFFSET $3", [networkId, params.pageSize, (params.page - 1) * params.pageSize]);
      const delegates = await q("SELECT d.*,p.name,c.name AS church_name FROM assembly_delegates d JOIN people p ON p.id=d.person_id JOIN churches c ON c.id=d.church_id JOIN convention_assemblies a ON a.id=d.assembly_id WHERE a.network_id=$1 ORDER BY d.created_at DESC", [networkId]);
      const documents = await q("SELECT d.*,a.title AS assembly_title FROM assembly_documents d JOIN convention_assemblies a ON a.id=d.assembly_id WHERE a.network_id=$1 ORDER BY d.created_at DESC", [networkId]);
      return { assemblies, assemblyPagination: { total: Number(total.total), page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(total.total) / params.pageSize)) }, delegates, documents };
    });
    s.json(result);
  }));
  app.post("/api/assemblies",route(async(r,s)=>{const b=z.object({title:z.string().trim().min(3).max(180),scheduledOn:z.iso.date(),location:z.string().max(180).default(""),status:z.enum(["draft","confirmed","completed","cancelled"]).default("draft"),quorumRequired:z.number().int().min(0).default(0),networkId:id.optional()}).parse(r.body);const networkId=b.networkId??await networkForActor(r);requireThat(networkId,403,"Somente a central da rede pode convocar assembleias.");requireThat(await networkForActor(r)===networkId,403,"Rede não autorizada para esta assembleia.");s.status(201).json(await db.transaction(async(q)=>{const [v]=await q("INSERT INTO convention_assemblies(network_id,title,scheduled_on,location,status,quorum_required,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[networkId,b.title,b.scheduledOn,b.location,b.status,b.quorumRequired,r.actor.id]);await audit(q,r.actor.id,r.church,"assembly.created",v.id);return v;}));}));
  app.post("/api/assemblies/:id/delegates",route(async(r,s)=>{const assemblyId=id.parse(r.params.id),b=z.object({churchId:id,personId:id}).parse(r.body);const networkId=await networkForActor(r);const [assembly]=await db.transaction(q=>q("SELECT network_id FROM convention_assemblies WHERE id=$1",[assemblyId]));requireThat(assembly,404,"Assembleia não encontrada.");const [church]=await db.transaction(q=>q("SELECT network_id FROM churches WHERE id=$1",[b.churchId]));requireThat(church?.network_id===assembly.network_id,400,"Igreja não pertence à rede da assembleia.");requireThat(b.churchId===r.church||networkId===assembly.network_id,403,"Somente a igreja ou a central pode indicar delegados.");s.status(201).json(await db.transaction(async(q)=>{const [v]=await q("INSERT INTO assembly_delegates(assembly_id,church_id,person_id,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(assembly_id,church_id,person_id) DO UPDATE SET status='invited' RETURNING *",[assemblyId,b.churchId,b.personId,r.actor.id]);await audit(q,r.actor.id,r.church,"assembly.delegate-invited",v.id);return v;}));}));
  app.patch("/api/assemblies/delegates/:id",route(async(r,s)=>{const delegateId=id.parse(r.params.id),b=z.object({status:z.enum(["invited","confirmed","revoked"]),checkedIn:z.boolean().default(false)}).parse(r.body);s.json(await db.transaction(async(q)=>{const [v]=await q("UPDATE assembly_delegates d SET status=$2,checked_in_at=CASE WHEN $3 THEN now() ELSE d.checked_in_at END FROM convention_assemblies a WHERE d.id=$1 AND d.assembly_id=a.id RETURNING d.*",[delegateId,b.status,b.checkedIn]);requireThat(v,404,"Delegado não encontrado.");await audit(q,r.actor.id,r.church,`assembly.delegate-${b.status}`,delegateId);return v;}));}));
  app.post("/api/assemblies/:id/documents",route(async(r,s)=>{const networkId=await networkForActor(r);requireThat(networkId,403,"Somente a central pode publicar documentos oficiais.");const assemblyId=id.parse(r.params.id),b=z.object({name:z.string().trim().min(2).max(180),url:z.string().trim().min(1).max(1000),kind:z.enum(["notice","agenda","minutes","official","other"]).default("official")}).parse(r.body);s.status(201).json(await scoped(r,async(q)=>{const [v]=await q("INSERT INTO assembly_documents(assembly_id,name,url,kind,added_by) VALUES($1,$2,$3,$4,$5) RETURNING *",[assemblyId,b.name,b.url,b.kind,r.actor.id]);await audit(q,r.actor.id,r.church,"assembly.document-added",v.id);return v;}));}));
}
