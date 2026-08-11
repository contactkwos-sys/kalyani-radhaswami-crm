import { createServiceClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/backup/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGoogleAuthUrl(state: string) {
  if (!isGoogleDriveConfigured()) {
    throw new Error(
      "Google Drive is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
    );
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || "Google token exchange failed");
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || "Google token refresh failed");
  return json as { access_token: string; expires_in: number };
}

async function driveFetch(
  accessToken: string,
  url: string,
  init?: RequestInit
) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  return res;
}

async function ensureFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const search = await driveFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`
  );
  const found = await search.json();
  if (found.files?.[0]?.id) return found.files[0].id as string;

  const create = await driveFetch(
    accessToken,
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      }),
    }
  );
  const created = await create.json();
  if (!create.ok) throw new Error(created.error?.message || "Folder create failed");
  return created.id as string;
}

export async function completeGoogleOAuth(code: string, userId: string) {
  const tokens = await exchangeCode(code);
  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );
  const profile = await profileRes.json();

  const root = await ensureFolder(tokens.access_token, "Kalyani-Radhaswami CRM");
  const backups = await ensureFolder(tokens.access_token, "Backups", root);
  const daily = await ensureFolder(tokens.access_token, "Daily", backups);
  const weekly = await ensureFolder(tokens.access_token, "Weekly", backups);
  const monthly = await ensureFolder(tokens.access_token, "Monthly", backups);

  const admin = createServiceClient();
  await admin.from("crm_drive_connections").update({ is_active: false }).eq("is_active", true);

  const { data, error } = await admin
    .from("crm_drive_connections")
    .insert({
      connected_by: userId,
      google_email: profile.email || null,
      access_token_enc: encryptSecret(tokens.access_token),
      refresh_token_enc: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : null,
      token_expiry: new Date(
        Date.now() + (tokens.expires_in || 3600) * 1000
      ).toISOString(),
      root_folder_id: backups,
      daily_folder_id: daily,
      weekly_folder_id: weekly,
      monthly_folder_id: monthly,
      scopes: SCOPES,
      is_active: true,
      last_error: null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function getActiveAccessToken(): Promise<{
  accessToken: string;
  connectionId: string;
  folders: {
    daily: string | null;
    weekly: string | null;
    monthly: string | null;
    root: string | null;
  };
}> {
  const admin = createServiceClient();
  const { data: conn, error } = await admin
    .from("crm_drive_connections")
    .select("*")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !conn) throw new Error("Google Drive is not connected.");

  let accessToken = decryptSecret(conn.access_token_enc);
  const expired =
    !conn.token_expiry || new Date(conn.token_expiry).getTime() < Date.now() + 60_000;

  if (expired) {
    if (!conn.refresh_token_enc) throw new Error("Google Drive re-connect required.");
    const refreshed = await refreshAccessToken(decryptSecret(conn.refresh_token_enc));
    accessToken = refreshed.access_token;
    await admin
      .from("crm_drive_connections")
      .update({
        access_token_enc: encryptSecret(accessToken),
        token_expiry: new Date(
          Date.now() + refreshed.expires_in * 1000
        ).toISOString(),
        last_error: null,
      })
      .eq("id", conn.id);
  }

  return {
    accessToken,
    connectionId: conn.id,
    folders: {
      daily: conn.daily_folder_id,
      weekly: conn.weekly_folder_id,
      monthly: conn.monthly_folder_id,
      root: conn.root_folder_id,
    },
  };
}

export async function uploadBufferToDrive(opts: {
  buffer: Buffer;
  fileName: string;
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL";
}): Promise<{ fileId: string; webLink: string | null }> {
  const { accessToken, folders, connectionId } = await getActiveAccessToken();
  const parent =
    opts.frequency === "WEEKLY"
      ? folders.weekly
      : opts.frequency === "MONTHLY"
        ? folders.monthly
        : folders.daily || folders.root;

  if (!parent) throw new Error("Drive backup folders missing. Reconnect Google Drive.");

  const metadata = {
    name: opts.fileName,
    parents: [parent],
  };

  const boundary = "crm_backup_boundary";
  const metaPart = JSON.stringify(metadata);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    ),
    opts.buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Drive upload failed");
      return { fileId: json.id, webLink: json.webViewLink || null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Drive upload failed");
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }

  const admin = createServiceClient();
  await admin
    .from("crm_drive_connections")
    .update({ last_error: lastError?.message || "upload failed" })
    .eq("id", connectionId);
  throw lastError!;
}

export async function getDriveConnectionSummary() {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_drive_connections")
    .select("id, google_email, is_active, connected_at, last_error, root_folder_id")
    .eq("is_active", true)
    .maybeSingle();
  return data;
}
