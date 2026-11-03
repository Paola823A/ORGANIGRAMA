export class AppError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function assert(condition, message, status = 400) {
  if (!condition) throw new AppError(message, status);
}
