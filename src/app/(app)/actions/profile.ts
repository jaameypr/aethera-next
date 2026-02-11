"use server";

import { requireSession } from "@/lib/auth/guards";
import { changePassword } from "@/lib/services/user.service";

export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
}) {
  const session = await requireSession();

  if (data.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  await changePassword(session.userId, data);
  return { success: true };
}
