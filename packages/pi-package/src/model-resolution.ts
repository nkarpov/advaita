export interface ResolvableModel {
  provider: string;
  id: string;
  name?: string | null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text: string): string {
  return normalize(text).replace(/\s+/g, "");
}

function scoreAlias(query: string, alias: string): number {
  const normalizedQuery = normalize(query);
  const normalizedAlias = normalize(alias);
  const compactQuery = compact(query);
  const compactAlias = compact(alias);
  if (!normalizedQuery || !normalizedAlias) return 0;

  if (normalizedQuery === normalizedAlias) return 1000 - normalizedAlias.length;
  if (compactQuery === compactAlias) return 975 - compactAlias.length;
  if (normalizedAlias.startsWith(normalizedQuery)) return 900 - normalizedAlias.length;
  if (compactAlias.startsWith(compactQuery)) return 875 - compactAlias.length;
  if (normalizedQuery.includes(normalizedAlias)) return 800 - normalizedAlias.length;

  const queryTokens = new Set(normalizedQuery.split(" "));
  const aliasTokens = normalizedAlias.split(" ");
  const overlap = aliasTokens.filter((token) => queryTokens.has(token)).length;
  if (overlap === 0) return 0;

  const allAliasTokensMatch = aliasTokens.every((token) => queryTokens.has(token));
  return (allAliasTokensMatch ? 700 : 500) + overlap * 20 - normalizedAlias.length;
}

function aliasesForModel(model: ResolvableModel): string[] {
  const aliases = new Set<string>();
  aliases.add(model.id);
  aliases.add(`${model.provider}/${model.id}`);
  aliases.add(`${model.provider} ${model.id}`);
  if (model.name) {
    aliases.add(model.name);
    aliases.add(`${model.provider} ${model.name}`);
  }
  return Array.from(aliases);
}

export function resolveModelQuery<TModel extends ResolvableModel>(query: string, models: TModel[]): TModel | undefined {
  let best: { model: TModel; score: number } | null = null;

  for (const model of models) {
    const bestAliasScore = Math.max(...aliasesForModel(model).map((alias) => scoreAlias(query, alias)), 0);
    if (bestAliasScore <= 0) continue;
    if (!best || bestAliasScore > best.score) {
      best = { model, score: bestAliasScore };
    }
  }

  return best?.model;
}
