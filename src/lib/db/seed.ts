import { connectDB } from "./connection";
import { UserModel } from "./models/user";
import { RoleModel } from "./models/role";
import { MailTemplateModel } from "./models/mail-template";
import { hashPassword } from "../auth/password";

const DEFAULT_MAIL_TEMPLATES = [
  {
    key: "user-invite",
    subject: "You have been invited to {{appName}}",
    htmlBody:
      "<p>Hello {{username}},</p><p>You have been invited to {{appName}}. Your temporary password is: <strong>{{tempPassword}}</strong></p><p>Please log in and change your password.</p>",
    textBody:
      "Hello {{username}}, you have been invited to {{appName}}. Your temporary password is: {{tempPassword}}. Please log in and change your password.",
    allowedPlaceholders: ["username", "appName", "tempPassword", "loginUrl"],
  },
  {
    key: "password-reset",
    subject: "Password Reset - {{appName}}",
    htmlBody:
      "<p>Hello {{username}},</p><p>Your password has been reset. Your new temporary password is: <strong>{{tempPassword}}</strong></p><p>Please log in and change your password.</p>",
    textBody:
      "Hello {{username}}, your password has been reset. Your new temporary password is: {{tempPassword}}. Please log in and change your password.",
    allowedPlaceholders: ["username", "appName", "tempPassword", "loginUrl"],
  },
];

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

  // Insert default mail templates
  for (const template of DEFAULT_MAIL_TEMPLATES) {
    const existing = await MailTemplateModel.findOne({ key: template.key });
    if (!existing) {
      await MailTemplateModel.create(template);
      console.log(`Created mail template: ${template.key}`);
    }
  }

  console.log("Seed complete.");
}
