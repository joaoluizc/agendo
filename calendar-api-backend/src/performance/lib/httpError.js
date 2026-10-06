/** An error the controller turns into this status, with the message shown to the admin. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (message) => new HttpError(404, message);
export const badRequest = (message) => new HttpError(400, message);
export const conflict = (message) => new HttpError(409, message);
