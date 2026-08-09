/** Central list of React Query cache keys, so invalidation stays consistent. */
export const queryKeys = {
  reference: {
    locations: ['reference', 'locations'] as const,
    categories: ['reference', 'categories'] as const,
  },
  library: {
    all: ['library'] as const,
    list: (userId: string) => ['library', 'list', userId] as const,
    entry: (id: string) => ['library', 'entry', id] as const,
  },
  bookshelves: {
    all: ['bookshelves'] as const,
    list: (userId: string) => ['bookshelves', 'list', userId] as const,
  },
  listings: {
    all: ['listings'] as const,
    list: (filters: unknown) => ['listings', 'list', filters] as const,
    detail: (id: string) => ['listings', 'detail', id] as const,
    photos: (userBookId: string) => ['listings', 'photos', userBookId] as const,
  },
  profile: {
    stats: (userId: string) => ['profile', 'stats', userId] as const,
  },
  search: {
    books: (query: string) => ['search', 'books', query] as const,
  },
} as const;
