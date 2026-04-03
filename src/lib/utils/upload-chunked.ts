export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Uploads a file in 5 MB chunks to the given chunk endpoint, then calls
 * the finalize endpoint.  Returns the finalize response as { status, body }.
 *
 * @param file          The File (or Blob) to upload
 * @param chunkUrl      POST endpoint that receives each chunk
 * @param finalizeUrl   POST endpoint called after all chunks are uploaded
 * @param finalizeBody  Extra fields merged into the finalize JSON body
 * @param onProgress    Progress callback invoked after each chunk
 */
export function uploadChunked(
  file: File,
  chunkUrl: string,
  finalizeUrl: string,
  finalizeBody: Record<string, unknown>,
  onProgress: (p: UploadProgress) => void,
): Promise<{ status: number; body: string }> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let completedBytes = 0;

  function sendChunk(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = index * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkSize = end - start;

      const xhr = new XMLHttpRequest();
      xhr.open("POST", chunkUrl);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Upload-Id", uploadId);
      xhr.setRequestHeader("X-Chunk-Index", String(index));

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: completedBytes + e.loaded,
            total: file.size,
            percent: Math.round(((completedBytes + e.loaded) / file.size) * 100),
          });
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          completedBytes += chunkSize;
          resolve();
        } else {
          reject(new Error(`Chunk ${index} fehlgeschlagen (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error("Upload fehlgeschlagen"));
      xhr.send(chunk);
    });
  }

  return (async () => {
    for (let i = 0; i < totalChunks; i++) {
      await sendChunk(i);
    }

    onProgress({ loaded: file.size, total: file.size, percent: 100 });

    const res = await fetch(finalizeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, filename: file.name, ...finalizeBody }),
    });

    return { status: res.status, body: await res.text() };
  })();
}
