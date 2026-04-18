import { chromium, type Browser, type BrowserContext } from 'playwright';
import { Redis } from 'ioredis';
import { load as cheerioLoad } from 'cheerio';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { SerpResult } from './serpScraper.js';

const PROXIES: Array<{ server: string; username?: string; password?: string }> = (
  env.PROXY_LIST ? env.PROXY_LIST.split(',').map((p) => p.trim()).filter(Boolean) : []
).map((raw) => {
  try {
    const url = new URL(raw);
    return {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: url.username || undefined,
      password: url.password || undefined,
    };
  } catch {
    return { server: raw };
  }
});

let proxyIndex = 0;
function nextProxy(): { server: string; username?: string; password?: string } | undefined {
  if (PROXIES.length === 0) return undefined;
  // eslint-disable-next-line no-plusplus
  return PROXIES[proxyIndex++ % PROXIES.length];
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?[\d\s\-().]{7,20})/g;
const FILE_EXT_REGEX = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i;
const SKIP_DOMAINS = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'google.com'];

export interface PageScrapedData {
  url: string;
  emails: string[];        // raw email strings found on page
  phones: string[];        // raw phone strings found on page
  fileUrls: string[];      // absolute URLs to downloadable files (.pdf/.docx/.doc/.xlsx/.xls)
  companyName?: string;    // from OpenGraph og:site_name or JSON-LD
  linkedinUrl?: string;    // linkedin.com/company/... URL found on page
  pageText: string;        // first 2000 chars of visible text (for fallback extraction)
}

const MAX_PAGES = 25;
const PAGE_DELAY_MS = 300;
const SCRAPER_TIMEOUT_MS = 90_000;

export async function runPageScraper(
  serpResults: SerpResult[],
  publisher: Redis,
  jobId: string
): Promise<PageScrapedData[]> {
  // Skip file URLs and social/search domains; cap at MAX_PAGES
  const pageUrls = serpResults
    .filter(r => !r.isFilePath && !SKIP_DOMAINS.some(d => r.url.includes(d)))
    .slice(0, MAX_PAGES);
  const fileUrls = serpResults.filter(r => r.isFilePath).map(r => r.url);

  logger.info('pageScraper: launching browser', { jobId, pagesToScrape: pageUrls.length });

  const browser = await chromium.launch({ headless: env.PLAYWRIGHT_HEADLESS });
  const results: PageScrapedData[] = [];
  const semaphore = new Semaphore(env.PLAYWRIGHT_CONCURRENCY);

  try {
    const scrapeAll = Promise.all(
      pageUrls.map(serpResult =>
        semaphore
          .run(() => scrapePage(browser, serpResult.url, fileUrls))
          .then(data => {
            if (data) {
              results.push(data);
              logger.info('pageScraper: page scraped', {
                jobId, url: serpResult.url, emails: data.emails.length, phones: data.phones.length,
              });
            }
          })
          .catch(err =>
            logger.warn('pageScraper: page failed', { jobId, url: serpResult.url, err: err instanceof Error ? err.message : String(err) })
          )
      )
    );

    await Promise.race([
      scrapeAll,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`pageScraper timeout after ${SCRAPER_TIMEOUT_MS}ms`)), SCRAPER_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    logger.warn('pageScraper: finishing early', { jobId, reason: err instanceof Error ? err.message : String(err), collected: results.length });
  } finally {
    await browser.close();
  }

  // Add file URLs gathered from snippet-only results
  if (fileUrls.length > 0) {
    const fileOnlyData: PageScrapedData = {
      url: 'collected-files',
      emails: [],
      phones: [],
      fileUrls,
      pageText: '',
    };
    results.push(fileOnlyData);
  }

  logger.info('Page scraper complete', { pages: pageUrls.length, results: results.length });
  return results;
}

async function scrapePage(
  browser: Browser,
  url: string,
  collectedFileUrls: string[]
): Promise<PageScrapedData | null> {
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      userAgent: randomUserAgent(),
      ignoreHTTPSErrors: true,
      proxy: nextProxy(),
    });
    const page = await context.newPage();

    await page.goto(url, {
      timeout: env.PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    // Dismiss common cookie banners
    for (const selector of [
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      '[id*="cookie"] button',
      '[class*="cookie"] button',
    ]) {
      await page.click(selector, { timeout: 2000 }).catch(() => {});
    }

    const html = await page.content();
    const $ = cheerioLoad(html);

    // Remove script/style noise
    $('script, style, nav, footer').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    // Extract emails from page text
    const emailSet = new Set<string>(bodyText.match(EMAIL_REGEX) ?? []);
    // Also check mailto: links
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const email = href.replace('mailto:', '').split('?')[0];
      if (email) emailSet.add(email);
    });
    const emailMatches = [...emailSet];

    // Extract phones from tel: links (PHONE_REGEX kept for reference but tel: links are more reliable)
    const phoneMatches: string[] = [];
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const phone = href.replace('tel:', '');
      if (phone) phoneMatches.push(phone);
    });

    // Extract file links
    const foundFileUrls: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (FILE_EXT_REGEX.test(href)) {
        const absolute = href.startsWith('http') ? href : new URL(href, url).href;
        foundFileUrls.push(absolute);
        collectedFileUrls.push(absolute);
      }
    });

    // Company name from OpenGraph
    const companyName =
      $('meta[property="og:site_name"]').attr('content') ??
      $('meta[name="application-name"]').attr('content') ??
      undefined;

    // LinkedIn URL
    let linkedinUrl: string | undefined;
    $('a[href*="linkedin.com/company"]').each((_, el) => {
      if (!linkedinUrl) linkedinUrl = $(el).attr('href');
    });

    // Small rate-limit delay
    await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));

    return {
      url,
      emails: emailMatches.filter(e => e.includes('@') && !e.includes('example.com')),
      phones: phoneMatches,
      fileUrls: foundFileUrls,
      companyName,
      linkedinUrl,
      pageText: bodyText.slice(0, 2000),
    };
  } catch (err) {
    logger.warn('scrapePage error', { url, err });
    return null;
  } finally {
    await context?.close();
  }
}

// Simple semaphore for concurrency control
class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(private max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  private release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!;
}

// Suppress unused-variable warning for PHONE_REGEX — retained for future text-based extraction
void PHONE_REGEX;
