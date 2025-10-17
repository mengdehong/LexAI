import type { TermDefinition } from "../state/AppState";

function sanitize(entry: TermDefinition): TermDefinition | null {
  const term = entry.term?.trim();
  const definition = entry.definition?.trim();
  const definitionCn = entry.definition_cn?.toString().trim();

  if (!term || !definition) {
    return null;
  }

  return {
    term,
    definition,
    ...(definitionCn ? { definition_cn: definitionCn } : {}),
  };
}

function chooseBetter(existing: TermDefinition, candidate: TermDefinition): TermDefinition {
  const existingCn = existing.definition_cn?.toString().trim() ?? "";
  const candidateCn = candidate.definition_cn?.toString().trim() ?? "";

  let definition = existing.definition;
  let definition_cn = existingCn || undefined;

  if (candidate.definition.length > definition.length) {
    definition = candidate.definition;
  }

  if (!existingCn && candidateCn) {
    definition = candidate.definition;
    definition_cn = candidateCn;
  } else if (existingCn && candidateCn && candidateCn.length > existingCn.length) {
    definition_cn = candidateCn;
  }

  return {
    term: existing.term,
    definition,
    ...(definition_cn ? { definition_cn } : {}),
  };
}

export function dedupeTermDefinitions(terms: TermDefinition[]): TermDefinition[] {
  const order: string[] = [];
  const map = new Map<string, TermDefinition>();

  for (const raw of terms) {
    const sanitized = sanitize(raw);
    if (!sanitized) {
      continue;
    }

    const key = sanitized.term.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, sanitized);
      order.push(key);
      continue;
    }

    map.set(key, chooseBetter(existing, sanitized));
  }

  return order.map((key) => map.get(key)!).filter(Boolean);
}
