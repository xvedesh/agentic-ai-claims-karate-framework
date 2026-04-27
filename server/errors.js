'use strict';

/**
 * Consistent error envelope used by every route.
 * Shape:
 *   { "error": { "code": "...", "message": "...", "details": {...} } }
 */
class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (code, message, details) => new ApiError(400, code, message, details);
const unauthorized = (message = 'Authentication required') =>
  new ApiError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Forbidden') => new ApiError(403, 'FORBIDDEN', message);
const notFound = (resource, id) =>
  new ApiError(404, 'NOT_FOUND', `${resource} not found`, { id });
const conflict = (code, message, details) => new ApiError(409, code, message, details);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const sendError = (res, status, code, message, details) => {
  res.status(status).json({ error: { code, message, details } });
};

const errorMiddleware = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }
  if (err && err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  console.error('[unhandled]', err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
};

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  asyncHandler,
  sendError,
  errorMiddleware,
};
