export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
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

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  console.error("Unhandled error:", error);
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}
