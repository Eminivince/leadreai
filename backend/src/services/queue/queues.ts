import { Queue } from 'bullmq';
import { getRedis } from '../../config/redis.js';

let _prospectingQueue: Queue | null = null;
let _enrichmentQueue: Queue | null = null;
let _outreachQueue: Queue | null = null;
let _exportQueue: Queue | null = null;

export function getProspectingQueue(): Queue {
  if (!_prospectingQueue) {
    _prospectingQueue = new Queue('prospecting', { connection: getRedis() });
  }
  return _prospectingQueue;
}

export function getEnrichmentQueue(): Queue {
  if (!_enrichmentQueue) {
    _enrichmentQueue = new Queue('enrichment', { connection: getRedis() });
  }
  return _enrichmentQueue;
}

export function getOutreachQueue(): Queue {
  if (!_outreachQueue) {
    _outreachQueue = new Queue('outreach', { connection: getRedis() });
  }
  return _outreachQueue;
}

export function getExportQueue(): Queue {
  if (!_exportQueue) {
    _exportQueue = new Queue('export', { connection: getRedis() });
  }
  return _exportQueue;
}
