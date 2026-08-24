import { createHmac } from 'node:crypto'

export const hashUserId = (orgSalt: string, userId: string): string =>
  createHmac('sha256', orgSalt).update(userId).digest('hex').slice(0, 32)
