import { NextResponse } from "next/server";
import { getBackupFileBuffer } from "@/lib/backup/actions";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const { buffer, fileName } = await getBackupFileBuffer(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
