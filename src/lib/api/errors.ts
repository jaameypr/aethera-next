export class HttpError extends Error {
  public code?: string;
  constructor(
    public statusCode: number,
    message: string,
    code?: string,
  ) {
    super(message);
    this.name = "HttpError";
    this.code = code;
  }
}

export function badRequest(message = "Bad Request") {
  return new HttpError(400, message);
}

export function unauthorized(message = "Unauthorized") {
  return new HttpError(401, message);
}

export function forbidden(message = "Forbidden") {
  return new HttpError(403, message);
}

export function notFound(message = "Not Found") {
  return new HttpError(404, message);
}

export function conflict(message = "Conflict") {
  return new HttpError(409, message);
}

export class VersionUpdateAvailableError extends HttpError {
  constructor(
    public readonly current: string | null,
    public readonly latest: string,
  ) {
    super(
      409,
      `A newer version (${latest}) is available; current is ${current ?? "none"}.`,
      "VERSION_UPDATE_AVAILABLE",
    );
    this.name = "VersionUpdateAvailableError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    const body: Record<string, unknown> = { error: error.message };
    if (error.code) body.code = error.code;
    if (error instanceof VersionUpdateAvailableError) {
      body.current = error.current;
      body.latest = error.latest;
    }
    return Response.json(body, { status: error.statusCode });
  }
  if (error instanceof Error && error.message) {
    console.error("Unhandled error:", error);
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error("Unhandled error:", error);
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}
