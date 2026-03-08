import "server-only";

import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { connectDB } from "@/lib/db/connection";
import { UserFileModel, type IUserFile } from "@/lib/db/models/user-file";
import { getUploadDir } from "@/lib/docker/storage";

const EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function uploadUserFile(
  file: File,
  identifier: string,
  userId: string,
): Promise<IUserFile> {
  await connectDB();

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const storagePath = path.join(uploadDir, `${identifier}-${file.name}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, buffer);

  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  const doc = await UserFileModel.create({
    identifier,
    originalFilename: file.name,
    storagePath,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    userId,
    expiresAt,
  });

  return doc.toObject() as IUserFile;
}

export async function listUserFiles(userId: string): Promise<IUserFile[]> {
  await connectDB();
  return UserFileModel.find({ userId })
    .sort({ createdAt: -1 })
    .lean<IUserFile[]>();
}

export async function getUserFile(fileId: string): Promise<IUserFile | null> {
  await connectDB();
  return UserFileModel.findById(fileId).lean<IUserFile>();
}

export async function deleteUserFile(fileId: string): Promise<void> {
  await connectDB();
  const doc = await UserFileModel.findById(fileId);
  if (!doc) return;

  try {
    await unlink(doc.storagePath);
  } catch {
    // file may already be gone (TTL expired or manually removed)
  }

  await UserFileModel.findByIdAndDelete(fileId);
}
