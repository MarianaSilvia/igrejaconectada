import { NextResponse } from "next/server";

import { getPublicMuralItem } from "../../../../public-content";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPublicMuralItem(id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  if (!result.item) {
    return NextResponse.json({ error: "Este aviso não está mais disponível." }, { status: 404 });
  }

  return NextResponse.json({ item: result.item });
}
