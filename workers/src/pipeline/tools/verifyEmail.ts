import { promises as dns } from 'dns';
import { logger } from '../../utils/logger.js';

export interface VerifyResult {
  address: string;
  hasMx: boolean;
  mxHost?: string;
  verdict: 'likely_valid' | 'likely_catch_all' | 'invalid_domain' | 'unknown';
}

const mxCache = new Map<string, { hasMx: boolean; mxHost?: string }>();

export async function verifyEmail(address: string): Promise<VerifyResult> {
  const addr = address.toLowerCase().trim();
  const parts = addr.split('@');
  if (parts.length !== 2) {
    return { address: addr, hasMx: false, verdict: 'invalid_domain' };
  }
  const domain = parts[1];
  if (!domain) {
    return { address: addr, hasMx: false, verdict: 'invalid_domain' };
  }

  const cached = mxCache.get(domain);
  if (cached) {
    return { address: addr, ...cached, verdict: cached.hasMx ? 'likely_valid' : 'invalid_domain' };
  }

  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) {
      mxCache.set(domain, { hasMx: false });
      return { address: addr, hasMx: false, verdict: 'invalid_domain' };
    }
    const mxHost = records.sort((a, b) => a.priority - b.priority)[0]?.exchange;
    mxCache.set(domain, { hasMx: true, mxHost });
    return { address: addr, hasMx: true, mxHost, verdict: 'likely_valid' };
  } catch (err) {
    logger.debug('[verifyEmail] MX lookup failed', { domain, err: err instanceof Error ? err.message : String(err) });
    mxCache.set(domain, { hasMx: false });
    return { address: addr, hasMx: false, verdict: 'unknown' };
  }
}
