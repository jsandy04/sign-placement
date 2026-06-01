import { NextRequest, NextResponse } from "next/server";
import { checkAndIncrementRateLimit } from "@/lib/db/queries";
import { GeocodeError } from "@/lib/pipeline/geocoder";
import { analyze } from "@/lib/pipeline/orchestrator";
import type { AnalyzeInput } from "@/lib/types";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  if (!checkAndIncrementRateLimit(ip)) {
    return NextResponse.json(
      {
        error: "RATE_LIMIT_EXCEEDED",
        message: "You've reached the daily limit. Try again tomorrow.",
      },
      { status: 429 },
    );
  }

  try {
    const input = await parseAnalyzeInput(request);
    const result = await analyze(input);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GeocodeError) {
      return NextResponse.json(
        {
          error: "GEOCODE_FAILED",
          message: "We couldn't find this address. Please check the address and try including the ZIP code.",
        },
        { status: 422 },
      );
    }

    console.error("[analyze] pipeline error:", error);
    return NextResponse.json(
      {
        error: "PIPELINE_FAILED",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }
}

async function parseAnalyzeInput(request: NextRequest): Promise<AnalyzeInput> {
  const body = (await request.json()) as Partial<AnalyzeInput>;

  if (typeof body.address !== "string" || body.address.trim().length === 0) {
    throw new Error("Address is required");
  }

  if (typeof body.signCount !== "number" || body.signCount < 1 || body.signCount > 12) {
    throw new Error("signCount must be between 1 and 12");
  }

  return {
    address: body.address,
    signCount: body.signCount,
  };
}

function clientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}
