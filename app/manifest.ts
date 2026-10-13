import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Igreja Conectada",
    short_name: "Igreja",
    description: "Sistema conectado da igreja para membros, agenda, mural, pedidos, EBD e Discipulado.",
    start_url: "/sistema",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f3f7fb",
    theme_color: "#0f6fa8",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
