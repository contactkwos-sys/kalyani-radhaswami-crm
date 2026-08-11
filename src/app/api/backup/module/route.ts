import { NextResponse } from "next/server";
import { createModuleExport } from "@/lib/backup/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { job, buffer } = await createModuleExport({
      module: String(body.module || ""),
      companyScope: body.companyScope === "ALL" ? "ALL" : String(body.companyScope || "ALL"),
      from: body.from || undefined,
      to: body.to || undefined,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${job.file_name}"`,
        "X-Backup-Id": job.id,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 400 }
    );
  }
}
