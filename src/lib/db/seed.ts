import { connectDB } from "./connection";
import { UserModel } from "./models/user";
import { RoleModel } from "./models/role";
import { hashPassword } from "../auth/password";

export async function seed() {
  await connectDB();

  // Create default admin role
  let adminRole = await RoleModel.findOne({ name: "admin" });
  if (!adminRole) {
    adminRole = await RoleModel.create({
      name: "admin",
      description: "Full system administrator",
      permissions: [{ name: "*", allow: true }],
    });
    console.log("Created admin role");
  } else {
    console.log("Admin role already exists, skipping");
  }

  // Create initial admin user
  const existingAdmin = await UserModel.findOne({ username: "admin" });
  if (!existingAdmin) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const email = process.env.ADMIN_EMAIL || "admin@localhost";
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
      console.warn(
        "[seed] ADMIN_PASSWORD not set — skipping admin user creation.",
      );
      console.warn("[seed] Set it in .env or use the /setup wizard.");
    } else {
      const passwordHash = await hashPassword(password);
      await UserModel.create({
        username,
        email,
        passwordHash,
        enabled: true,
        roles: [adminRole.name],
        permissions: [],
      });
      console.log(`Created admin user: ${username}`);
    }
  } else {
    console.log("Admin user already exists, skipping");
  }

  console.log("Seed complete.");
}
