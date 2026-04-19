// Centralized error handling for MS API

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode: number = 500, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export const Errors = {
  VALIDATION: (message: string, details?: Record<string, unknown>) => 
    new AppError('VALIDATION_ERROR', message, 400, details),
  
  NOT_FOUND: (resource: string, id?: string) => 
    new AppError('NOT_FOUND', `${resource} not found${id ? `: ${id}` : ''}`, 404),
  
  UNAUTHORIZED: (message: string = 'Unauthorized') => 
    new AppError('UNAUTHORIZED', message, 401),
  
  FORBIDDEN: (message: string = 'Forbidden') => 
    new AppError('FORBIDDEN', message, 403),
  
  CONFLICT: (message: string) => 
    new AppError('CONFLICT', message, 409),
  
  INTERNAL: (message: string = 'Internal server error') => 
    new AppError('INTERNAL_ERROR', message, 500),
} as const;

// Format error response
export function formatErrorResponse(error: unknown): { statusCode: number; body: { success: false; error: APIError } } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
    };
  }

  // Unknown error
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
      },
    },
  };
}

// Express error handler middleware
export function errorHandler(err: Error, req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) {
  const { statusCode, body } = formatErrorResponse(err);
  
  // Log error for monitoring
  console.error(`[Error] ${req.method} ${req.path}`, {
    code: body.error.code,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(statusCode).json(body);
}
