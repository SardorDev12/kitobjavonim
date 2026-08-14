import type { AdminReport, AvailabilityType } from '../../../src/types/database';

import { supabase } from './supabaseClient';

export type { AdminReport };

export type AdminStats = {
  total_users: number;
  total_books: number;
  total_listings: number;
  open_reports: number;
  resolved_reports: number;
  new_users_7d: number;
  new_listings_7d: number;
};

export type AdminUser = {
  user_id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  is_banned: boolean;
  region_id: string | null;
  district_id: string | null;
  book_count: number;
  listing_count: number;
  created_at: string;
};

export type AdminListing = {
  user_book_id: string;
  book_id: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  availability_type: AvailabilityType;
  sale_price: number | null;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  listed_at: string | null;
  open_report_count: number;
};

export type BookUpdate = {
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publication_year: number | null;
  language: string | null;
  cover_url: string | null;
  description: string | null;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const adminApi = {
  stats: () => rpc<AdminStats[]>('admin_stats').then((rows) => rows[0] ?? null),

  listReports: () => rpc<AdminReport[]>('admin_list_reports'),
  resolveReport: (reportId: string) => rpc<void>('admin_resolve_report', { p_report_id: reportId }),

  listUsers: (search: string, limit = 50, offset = 0) =>
    rpc<AdminUser[]>('admin_list_users', { p_search: search || null, p_limit: limit, p_offset: offset }),
  setAdmin: (userId: string, isAdmin: boolean) =>
    rpc<void>('admin_set_admin', { p_user_id: userId, p_is_admin: isAdmin }),

  listListings: (search: string, limit = 50, offset = 0) =>
    rpc<AdminListing[]>('admin_list_listings', { p_search: search || null, p_limit: limit, p_offset: offset }),
  unlist: (userBookId: string) => rpc<void>('admin_unlist', { p_user_book_id: userBookId }),

  updateBook: (bookId: string, book: BookUpdate) =>
    rpc<void>('admin_update_book', {
      p_book_id: bookId,
      p_title: book.title,
      p_subtitle: book.subtitle,
      p_authors: book.authors,
      p_publisher: book.publisher,
      p_publication_year: book.publication_year,
      p_language: book.language,
      p_cover_url: book.cover_url,
      p_description: book.description,
    }),
  deleteBook: (bookId: string) => rpc<void>('admin_delete_book', { p_book_id: bookId }),

  // These three need the Auth Admin API (service_role), which no RLS-bound
  // SQL function can reach — see supabase/functions/admin-users/README.md.
  createAdmin: (email: string, password: string, displayName: string) =>
    invokeAdminUsers<{ id: string; email: string }>({
      action: 'create_admin',
      email,
      password,
      display_name: displayName,
    }),
  setBan: (userId: string, banned: boolean) =>
    invokeAdminUsers<{ ok: true }>({ action: 'set_ban', user_id: userId, banned }),
  deleteUser: (userId: string) => invokeAdminUsers<{ ok: true }>({ action: 'delete_user', user_id: userId }),
};

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('admin-users', { body });
  if (error) throw error;
  if (data && 'error' in data && data.error) throw new Error(data.error);
  return data as T;
}
