import { Queue } from 'bullmq';
import { getRedis } from '../../config/redis.js';
import { env } from '../../config/env.js';

const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;

const defaultJobOptions = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};

let _prospectingQueue: Queue | null = null;
let _enrichmentQueue: Queue | null = null;
let _outreachQueue: Queue | null = null;
let _exportQueue: Queue | null = null;

export function getProspectingQueue(): Queue {
  if (!_prospectingQueue) {
    _prospectingQueue = new Queue('prospecting', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions,
    });
  }
  return _prospectingQueue;
}

export function getEnrichmentQueue(): Queue {
  if (!_enrichmentQueue) {
    _enrichmentQueue = new Queue('enrichment', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions,
    });
  }
  return _enrichmentQueue;
}

export function getOutreachQueue(): Queue {
  if (!_outreachQueue) {
    _outreachQueue = new Queue('outreach', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions,
    });
  }
  return _outreachQueue;
}

export function getExportQueue(): Queue {
  if (!_exportQueue) {
    _exportQueue = new Queue('export', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions,
    });
  }
  return _exportQueue;
}
