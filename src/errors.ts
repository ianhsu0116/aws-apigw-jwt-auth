export abstract class AuthError extends Error {
  abstract statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class UnauthenticatedError extends AuthError {
  statusCode = 401;

  constructor(message = 'Unauthenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AuthError {
  statusCode = 403;

  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
