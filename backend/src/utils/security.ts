/**
 * Utility to mask sensitive strings for logging.
 */
export function maskToken(token: string | undefined): string {
  if (!token) return "null";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function sanitizeLogData(data: any): any {
  // Add additional sanitization here if payloads contain sensitive info
  return data;
}
