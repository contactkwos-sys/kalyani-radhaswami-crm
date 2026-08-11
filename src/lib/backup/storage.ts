import { createServiceClient } from "@/lib/supabase/admin";

const BUCKET = "crm-backups";

export async function uploadBackupArtifact(
  path: string,
  buffer: Buffer,
  contentType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
) {
  const admin = createServiceClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export async function downloadBackupArtifact(path: string): Promise<Buffer> {
  const admin = createServiceClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Backup file not found");
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function removeBackupArtifact(path: string) {
  const admin = createServiceClient();
  await admin.storage.from(BUCKET).remove([path]);
}
