import { NextResponse } from "next/server";
import { adminUserModel } from "@/server/models";

export async function GET() {
  const adminCount = await adminUserModel.count();
  return NextResponse.json(
    { setupComplete: adminCount > 0 },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
