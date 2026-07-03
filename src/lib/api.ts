import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ZodError, ZodSchema } from 'zod'

/**
 * Wrap a route handler with consistent error handling.
 * Maps Prisma errors to proper HTTP status codes.
 * Prevents stack-trace leakage in production.
 */
export function withErrorHandler<TArgs extends any[]>(
  handler: (...args: TArgs) => Promise<NextResponse | Response>
): (...args: TArgs) => Promise<NextResponse | Response> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (e) {
      return mapError(e)
    }
  }
}

/**
 * Validate a request body against a zod schema. Returns `{success, data}` or `{success, error}`.
 */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; error: NextResponse } {
  try {
    const data = schema.parse(body)
    return { success: true, data }
  } catch (e) {
    if (e instanceof ZodError) {
      const issues = (e.issues ?? (e as any).errors) as Array<{ path: PropertyKey[]; message: string }>
      return {
        success: false,
        error: NextResponse.json(
          { error: 'VALIDATION_ERROR', details: issues.map((er) => ({ path: er.path.join('.'), message: er.message })) },
          { status: 422 }
        ),
      }
    }
    throw e
  }
}

function mapError(e: unknown): NextResponse {
  // Prisma known errors
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002': // unique constraint
        return NextResponse.json({ error: 'CONFLICT', code: e.code, message: 'A record with this value already exists' }, { status: 409 })
      case 'P2025': // record not found
        return NextResponse.json({ error: 'NOT_FOUND', code: e.code, message: 'Record not found' }, { status: 404 })
      case 'P2003': // FK constraint
        return NextResponse.json({ error: 'FK_VIOLATION', code: e.code, message: 'Referenced record does not exist' }, { status: 400 })
      case 'P2014': // invalid relation
        return NextResponse.json({ error: 'INVALID_RELATION', code: e.code }, { status: 400 })
      default:
        return NextResponse.json({ error: 'DB_ERROR', code: e.code }, { status: 400 })
    }
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid query parameters' }, { status: 400 })
  }
  // Generic
  const msg = e instanceof Error ? e.message : 'Internal server error'
  console.error('[indos-api] unhandled error:', msg)
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: process.env.NODE_ENV === 'production' ? 'Internal server error' : msg }, { status: 500 })
}
