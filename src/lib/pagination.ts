import { Prisma } from '@prisma/client'

/**
 * Cursor pagination helper.
 *
 * Usage in a route:
 *   const { cursor, limit, paginated } = parsePaginationParams(req)
 *   if (!paginated) {
 *     // backward compat: return flat array
 *     const items = await db.device.findMany({ take: 200, orderBy: { createdAt: 'desc' } })
 *     return NextResponse.json(items)
 *   }
 *   const result = await cursorPaginate(db.device, { cursor, limit, orderBy: 'createdAt' })
 *   return NextResponse.json(result)
 */

export interface PaginationParams {
  cursor: string | null
  limit: number
  paginated: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

/**
 * Parse pagination params from a request URL.
 * ?paginated=true&cursor=xxx&limit=50
 */
export function parsePaginationParams(req: Request): PaginationParams {
  const url = new URL(req.url)
  const paginated = url.searchParams.get('paginated') === 'true'
  const cursor = url.searchParams.get('cursor') || null
  const limitRaw = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)
  const limit = Math.min(Math.max(1, limitRaw || DEFAULT_LIMIT), MAX_LIMIT)
  return { cursor, limit, paginated }
}

/**
 * Decode a cursor. Cursors are base64-encoded JSON: { createdAt, id }.
 */
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
    if (decoded.createdAt && decoded.id) return decoded
    return null
  } catch {
    return null
  }
}

/**
 * Encode a cursor from the last item.
 */
function encodeCursor(item: { createdAt: Date | string; id: string }): string {
  const ts = item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt
  return Buffer.from(JSON.stringify({ createdAt: ts, id: item.id })).toString('base64')
}

/**
 * Apply cursor pagination to a Prisma model findMany.
 *
 * @param model - Prisma model delegate (e.g. db.device)
 * @param opts - { cursor, limit, where, include, orderByField }
 */
export async function cursorPaginate<T extends { id: string; createdAt: Date | string }>(
  model: {
    findMany: (args: any) => Promise<T[]>
    count: (args: any) => Promise<number>
  },
  opts: {
    cursor: string | null
    limit: number
    where?: any
    include?: any
    orderByField?: string // default: 'createdAt'
  }
): Promise<PaginatedResult<T>> {
  const { cursor, limit, where, include, orderByField = 'createdAt' } = opts

  // Build cursor condition: items strictly before the cursor (createdAt desc)
  let cursorWhere: any = {}
  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded) {
      cursorWhere = {
        OR: [
          { [orderByField]: { lt: new Date(decoded.createdAt) } },
          {
            [orderByField]: { equals: new Date(decoded.createdAt) },
            id: { gt: decoded.id },
          },
        ],
      }
    }
  }

  // Fetch limit + 1 to check if there's more
  const items = await model.findMany({
    where: { AND: [where || {}, cursorWhere] },
    orderBy: [{ [orderByField]: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include,
  })

  const hasMore = items.length > limit
  const pageItems = hasMore ? items.slice(0, limit) : items
  const nextCursor = hasMore && pageItems.length > 0
    ? encodeCursor(pageItems[pageItems.length - 1])
    : null

  return {
    items: pageItems,
    nextCursor,
    hasMore,
  }
}
