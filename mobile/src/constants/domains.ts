import type { QuestionDomain } from '../models';

/** NAPLEX domain display labels, shared by SystemScreen (M3) and the Question Engine (M4). */
export const DOMAIN_LABELS: Record<QuestionDomain, string> = {
  1: 'Domain 1',
  2: 'Domain 2',
  3: 'Domain 3',
  4: 'Domain 4',
  5: 'Domain 5',
};

/** Safe lookup for a domain value coming from a loosely-typed source (e.g. a string key from Object.entries). */
export function domainLabel(domain: number): string {
  return (DOMAIN_LABELS as Record<number, string>)[domain] ?? `Domain ${domain}`;
}
