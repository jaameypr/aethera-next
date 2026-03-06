import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";
import { connectDB } from "../db/connection";
import { UserModel } from "../db/models/user";
import { RoleModel } from "../db/models/role";
import { hasPermission } from "../permissions";
import { unauthorized, forbidden } from "../api/errors";
import type { NextRequest } from "next/server";

export interface Session {
  userId: string;
  roles: string[];
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (!accessToken) return null;

  try {
    const payload: AccessTokenPayload = await verifyAccessToken(accessToken);
    return { userId: payload.sub, roles: payload.roles };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requirePermission(permissionName: string): Promise<Session> {
  const session = await requireSession();

  await connectDB();
  const user = await UserModel.findById(session.userId).lean();
  if (!user) redirect("/login");

  const roleDocs = await RoleModel.find({ name: { $in: user.roles } }).lean();
  const rolePermissions = roleDocs.flatMap((r) => r.permissions);

  if (!hasPermission(user.permissions, rolePermissions, permissionName)) {
    redirect("/unauthorized");
  }

  return session;
}

// API route wrappers
type RouteParams = Record<string, string | string[]>;

export function withAuth<P extends RouteParams = Record<string, string>>(
  handler: (
    req: NextRequest,
    context: { session: Session; params: P },
  ) => Promise<Response>,
) {
  return async (req: NextRequest, segmentData: { params: Promise<P> }) => {
    const accessToken = req.cookies.get("access_token")?.value;
    if (!accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const payload = await verifyAccessToken(accessToken);
      const session: Session = { userId: payload.sub, roles: payload.roles };
      const params = await segmentData.params;
      return handler(req, { session, params });
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  };
}

export function withPermission<P extends RouteParams = Record<string, string>>(
  permission: string,
  handler: (
    req: NextRequest,
    context: { session: Session; params: P },
  ) => Promise<Response>,
) {
  return withAuth<P>(async (req, context) => {
    await connectDB();
    const user = await UserModel.findById(context.session.userId).lean();
    if (!user) {
      throw unauthorized("User not found");
    }

    const roleDocs = await RoleModel.find({
      name: { $in: user.roles },
    }).lean();
    const rolePermissions = roleDocs.flatMap((r) => r.permissions);

    if (!hasPermission(user.permissions, rolePermissions, permission)) {
      throw forbidden("Insufficient permissions");
    }

    return handler(req, context);
  });
}
