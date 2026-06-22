import { NextRequest, NextResponse } from "next/server";
import {
  submitCorrection,
  getRecentCorrections,
} from "../../../lib/zg-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const corrections = await getRecentCorrections(10);
    return NextResponse.json({ corrections });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, corrections: [] },
      { status: 200 } // soft-fail so UI still renders before contract is deployed
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fromStop, toStop, detail, storageHash } = await req.json();
    if (!fromStop || !toStop || !detail) {
      return NextResponse.json(
        { error: "fromStop, toStop, detail required" },
        { status: 400 }
      );
    }
    const txHash = await submitCorrection(
      fromStop,
      toStop,
      detail,
      storageHash || ""
    );
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
