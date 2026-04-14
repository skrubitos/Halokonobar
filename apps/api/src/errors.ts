import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(404, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(400, 'INVALID_STATUS_TRANSITION', `Cannot transition order from '${from}' to '${to}'`);
  }
}

export function errorHandler(
  error: FastifyError | AppError,
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      data: null,
      error: { code: error.code, message: error.message },
    });
  }

  // Fastify validation errors
  if (error.statusCode === 400 && error.validation) {
    return reply.status(400).send({
      data: null,
      error: { code: 'VALIDATION_ERROR', message: error.message, details: error.validation },
    });
  }

  // JWT errors
  if (error.statusCode === 401) {
    return reply.status(401).send({
      data: null,
      error: { code: 'UNAUTHORIZED', message: error.message },
    });
  }

  console.error('Unhandled error:', error);
  return reply.status(500).send({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
