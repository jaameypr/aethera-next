import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { runUpdate } from "@/lib/services/app-update.service";

/** Duck-types the service's 409 "jobs in flight" error (carries runningJobs). */
function isJobsInFlight(
  error: unknown,
): error is { statusCode: number; runningJobs: number; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { statusCode?: unknown }).statusCode === 409 &&
    typeof (error as { runningJobs?: unknown }).runningJobs === "number"
  );
}

/**
 * Audited auto-update action (#20).
 *
 * Gated on `system.update`. Requires explicit confirmation. Refuses with 409
 * (carrying `runningJobs`) when work is still in flight unless `wait:true` is
 * passed, in which case it drains jobs before applying.
 *
 * The permission guard THROWS on a missing permission (rejecting the returned
 * promise); only authorized requests reach the handler body.
 */
export const POST = withPermission("system.update", async (req, { session }) => {
  try {
    let body: { confirm?: boolean; wait?: boolean } = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      body = {};
    }

    if (!body.confirm) {
      return Response.json(
        { error: "confirmation required" },
        { status: 400 },
      );
    }

    const result = await runUpdate({
      wait: Boolean(body.wait),
      actorId: session.userId,
    });
    return Response.json(result);
  } catch (error) {
    if (isJobsInFlight(error)) {
      return Response.json(
        { error: error.message, runningJobs: error.runningJobs },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
});
