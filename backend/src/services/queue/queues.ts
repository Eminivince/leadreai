import { Queue } from 'bullmq';
import { getRedis } from '../../config/redis.js';
import { env } from '../../config/env.js';

export const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;

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
let _contactEnrichmentQueue: Queue | null = null;
let _hubspotSyncQueue: Queue | null = null;
let _sequenceStepQueue: Queue | null = null;

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

export function getContactEnrichmentQueue(): Queue {
  if (!_contactEnrichmentQueue) {
    _contactEnrichmentQueue = new Queue('contact-enrichment', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions,
    });
  }
  return _contactEnrichmentQueue;
}

export function getHubspotSyncQueue(): Queue {
  if (!_hubspotSyncQueue) {
    _hubspotSyncQueue = new Queue('hubspot-sync', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions,
    });
  }
  return _hubspotSyncQueue;
}

export function getSequenceStepQueue(): Queue {
  if (!_sequenceStepQueue) {
    _sequenceStepQueue = new Queue('sequence-step', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 2000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    });
  }
  return _sequenceStepQueue;
}
