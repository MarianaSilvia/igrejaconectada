import Link from "next/link";

import { formatDate } from "../../../app-helpers";
import { getPublicMuralItem } from "../../../public-content";

export const dynamic = "force-dynamic";

export default async function PublicMuralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { item } = await getPublicMuralItem(id);
  const image = item?.bannerUrl || item?.imageDataUrl || "";

  return (
    <main className="public-share-page">
      <section className="public-share-shell">
        <div className="public-share-brand">
          <span>IC</span>
          <div>
            <strong>Igreja Conectada</strong>
            <small>Mural público</small>
          </div>
        </div>

        {!item ? (
          <article className="public-share-card">
            <p className="eyebrow">Aviso indisponível</p>
            <h1>Este aviso não está mais disponível.</h1>
            <p>O mural pode ter expirado, sido retirado da publicação ou o link pode estar incorreto.</p>
            <Link className="public-share-button" href="/">
              Acessar o sistema
            </Link>
          </article>
        ) : (
          <article className="public-share-card">
            {image && (
              <div className="public-share-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={item.title} src={image} />
              </div>
            )}
            <p className="eyebrow">{item.category || "Mural"}</p>
            <h1>{item.title}</h1>
            {item.expiresAt && <p className="public-share-muted">Disponível até {formatDate(item.expiresAt)}</p>}
            {item.socialUrl && (
              <a className="public-share-button" href={item.socialUrl} rel="noreferrer" target="_blank">
                Abrir link do aviso
              </a>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
