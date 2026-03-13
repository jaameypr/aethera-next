import "server-only";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";

/**
 * Fügt einem User eine Permission hinzu, falls er sie noch nicht hat.
 * Wird nach Projekt- und Server-Erstellung aufgerufen um dem Ersteller
 * automatisch Lese-/Schreibrechte zu geben.
 */
export async function grantIfAbsent(userId: string, permissionName: string): Promise<void> {
  await connectDB();
  const user = await UserModel.findById(userId);
  if (!user) return;

  const exists = user.permissions.some(
    (p: { name: string; allow: boolean }) => p.name === permissionName && p.allow
  );
  if (exists) return;

  user.permissions.push({ name: permissionName, allow: true });
  await user.save();
}

/**
 * Entfernt eine Permission von einem User.
 */
export async function revoke(userId: string, permissionName: string): Promise<void> {
  await connectDB();
  await UserModel.updateOne(
    { _id: userId },
    { $pull: { permissions: { name: permissionName } } }
  );
}
