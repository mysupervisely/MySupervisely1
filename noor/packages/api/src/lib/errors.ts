/** Base class for errors that should be surfaced to the client with a
 * specific status code and a safe, generic message — see the global error
 * handler in app.ts, which never leaks internal detail for anything that
 * is NOT one of these. */
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthenticationError extends HttpError {
  constructor(message = "Authentication required.") {
    super(401, message);
  }
}

export class AuthorizationError extends HttpError {
  constructor(message = "You do not have access to this resource.") {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found.") {
    super(404, message);
  }
}

export class ValidationError extends HttpError {
  constructor(message = "Invalid request.") {
    super(400, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict.") {
    super(409, message);
  }
}
