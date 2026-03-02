import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a Blob/File to the linked Google Drive folder for a job.
 * Returns the Drive file ID and web view link.
 */
export async function uploadToDrive(
  jobId: string,
  fileName: string,
  blob: Blob,
  subfolder: string,
  mimeType?: string,
): Promise<{ drive_file_id: string; web_view_link: string } | null> {
  // Convert blob to base64
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke("google-drive-auth", {
    body: {
      action: "upload_to_drive",
      job_id: jobId,
      file_name: fileName,
      file_base64: base64,
      mime_type: mimeType || "application/octet-stream",
      subfolder,
    },
  });

  if (error) throw error;
  if (!data.success) throw new Error(data.error || "Upload failed");

  return {
    drive_file_id: data.drive_file_id,
    web_view_link: data.web_view_link,
  };
}

/**
 * Check if a job has a Drive link (for showing upload toggle)
 */
export async function hasJobDriveLink(jobId: string): Promise<boolean> {
  try {
    const { data } = await supabase.functions.invoke("google-drive-auth", {
      body: { action: "get_job_link", job_id: jobId },
    });
    return !!data?.link;
  } catch {
    return false;
  }
}
