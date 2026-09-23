import type { Metadata } from "next";
import SystemApp from "../SystemApp";

export const metadata: Metadata = {
  title: "Entrar no sistema | Igreja Conectada",
  description: "Acesse o painel do Igreja Conectada.",
};

export default function SistemaPage() {
  return <SystemApp />;
}
