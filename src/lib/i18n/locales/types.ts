import type { Catalogue } from './en';

/**
 * A translation must supply every key English defines. It may add more —
 * Russian needs `_few` and `_many` plural forms that English has no use for —
 * so extra string keys are allowed alongside the required set.
 */
export type LocaleCatalogue = Catalogue & Record<string, string>;
