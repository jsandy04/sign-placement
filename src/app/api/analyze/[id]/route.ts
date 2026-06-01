import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/db/queries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = getAnalysis(id);

  if (!result) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(result);
}
