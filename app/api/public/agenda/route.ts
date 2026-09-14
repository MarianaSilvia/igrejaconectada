import { NextResponse } from "next/server";

import { getPublicAgenda } from "../../../public-content";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? undefined;
  const result = await getPublicAgenda(date);

  if (result.error) {
    return NextResponse.json({ error: result.error, date: result.date, events: [] }, { status: 503 });
  }

  return NextResponse.json({ date: result.date, events: result.events });
}
