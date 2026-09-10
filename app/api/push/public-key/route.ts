import { NextResponse } from "next/server";

import { getVapidPublicKey, isPushConfigured } from "../../../push-service";

export async function GET() {
  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey(),
  });
}
