import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { browserConfig } from "../../../../lib/config";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  if (!eventId) {
    return new NextResponse("Event ID required", { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new NextResponse("Authorization required", { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length).trim();

  if (!browserConfig.ok) {
    return new NextResponse("Server configuration unavailable", { status: 503 });
  }

  const supabase = createClient(browserConfig.config.url, browserConfig.config.publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: qrToken, error } = await supabase.rpc("generate_qr_credential", {
    p_event_id: eventId,
  });

  if (error || !qrToken) {
    const status = error?.message?.includes("AUTH_REQUIRED")
      ? 401
      : error?.message?.includes("NOT_REGISTERED")
      ? 404
      : 400;
    return new NextResponse(error?.message || "Failed to generate QR credential", { status });
  }

  try {
    const pngBuffer = await QRCode.toBuffer(qrToken as string, {
      type: "png",
      width: 280,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });

    return new NextResponse(pngBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("QR image generation failed", { status: 500 });
  }
}
