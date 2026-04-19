import { guessCompanyDomains } from '../domainGuesser.js';
import type { ToolDef } from './index.js';

export const guessDomainsTool: ToolDef = {
  name: 'guess_domains',
  description: 'Given a company name (and optional country), produce ranked candidate domain strings. Combine with verify_email to find which ones have MX records.',
  parametersSchema: '{"entity": string, "country"?: string}',
  handler: async (args) => {
    const entity = String(args?.entity ?? '').trim();
    if (!entity) return { ok: false, output: 'entity required' };
    const country = args?.country ? String(args.country) : undefined;
    const candidates = guessCompanyDomains(entity, country);
    return { ok: true, output: JSON.stringify({ candidates }) };
  },
};
