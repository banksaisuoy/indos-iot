/**
 * Pure decision function for the Critical Alarm Banner's "Ack All Critical"
 * action. Extracted from the React component so the operator-safety contract
 * is unit-testable without a browser.
 *
 * CONTRACT (the "ack failure must not hide alarm" rule):
 *   - On a successful server ack (2xx): dismiss the banner AND ack the live
 *     (in-memory) alarms. The server confirmed the DB rows moved, so it is
 *     safe to clear the visual alert.
 *   - On ANY failure (network error, 401, 403, 404, 500, …): do NOT dismiss
 *     the banner and do NOT ack the live alarms. The alarms remain active and
 *     visible so the operator knows they still need attention. A clear error
 *     toast tells them what happened.
 *
 * This replaces the previous behaviour where `setDismissedAt(Date.now())` and
 * `ackAlarm(id)` ran BEFORE the fetch resolved — which hid the banner even
 * when the bulk-ack server call failed, silently suppressing active critical
 * alarms.
 *
 * @param httpStatus The HTTP status code returned by POST /alarms/bulk-ack,
 *                   or `null` if the fetch threw (network error / CORS / abort).
 * @param liveCount  Number of live critical alarms the banner is about to ack.
 */
export interface AckOutcome {
  /** Advance the dismiss gate so the banner hides until a NEW critical arrives. */
  dismiss: boolean
  /** Emit ack-alarm for each live critical id (updates the in-memory stream). */
  ackLive: boolean
  /** Toast to surface to the operator. */
  toast: {
    type: 'success' | 'error' | 'info'
    message: string
    description?: string
  }
}

export function decideAckOutcome(httpStatus: number | null, liveCount: number): AckOutcome {
  const plural = liveCount === 1 ? '' : 's'

  // Network failure — server unreachable, CORS, abort, etc.
  if (httpStatus === null) {
    return {
      dismiss: false,
      ackLive: false,
      toast: {
        type: 'error',
        message: 'Bulk acknowledge failed',
        description: 'Network error — alarms remain active. Check your connection and retry.',
      },
    }
  }

  // Success — server confirmed the DB rows moved to acknowledged.
  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      dismiss: true,
      ackLive: true,
      toast: {
        type: 'success',
        message: `Acknowledged ${liveCount} live critical alarm${plural}`,
        description: 'Bulk ack confirmed by server.',
      },
    }
  }

  // Session expired — operator must sign in again. Alarms stay visible.
  if (httpStatus === 401) {
    return {
      dismiss: false,
      ackLive: false,
      toast: {
        type: 'error',
        message: 'Session expired',
        description: 'Please sign in again. Critical alarms remain active.',
      },
    }
  }

  // Forbidden — operator/viewer role cannot bulk-ack (engineer+ required).
  if (httpStatus === 403) {
    return {
      dismiss: false,
      ackLive: false,
      toast: {
        type: 'error',
        message: 'Insufficient permissions',
        description: 'Engineer+ role required to bulk-acknowledge. Alarms remain active.',
      },
    }
  }

  // Any other non-2xx (404 endpoint missing, 500 server error, 429 rate limit, …).
  return {
    dismiss: false,
    ackLive: false,
    toast: {
      type: 'error',
      message: 'Bulk acknowledge failed',
      description: `Server returned ${httpStatus}. Critical alarms remain active — please retry.`,
    },
  }
}
