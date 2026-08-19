/**
 * Types mirroring supabase/migrations.
 *
 * Hand-written rather than generated so the repo stays runnable without the
 * Supabase CLI. If you do install it, `supabase gen types typescript` produces
 * the same shape and can replace this file wholesale.
 */

export type ReadingStatus = 'want_to_read' | 'reading' | 'finished';
export type AvailabilityType = 'private' | 'exchange' | 'sale' | 'exchange_or_sale';
export type BookCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
export type ContactChannel = 'telegram' | 'phone';
export type MetadataSource = 'google_books' | 'open_library' | 'manual';

export const READING_STATUSES: readonly ReadingStatus[] = ['want_to_read', 'reading', 'finished'];
export const BOOK_CONDITIONS: readonly BookCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];

export type LocationRow = {
  id: string;
  parent_id: string | null;
  level: 'region' | 'district';
  name_uz: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
};

export type CategoryRow = {
  id: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  region_id: string | null;
  district_id: string | null;
  telegram_username: string | null;
  phone: string | null;
  show_phone: boolean;
  show_telegram: boolean;
  preferred_locale: 'uz' | 'ru' | 'en';
  onboarded_at: string | null;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  /** Set directly in the database, never client-writable — gates /admin/reports. */
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

/** Return shape of the `my_plan_status()` RPC (supabase/migrations/0008_plans_and_limits.sql). */
export type PlanStatus = {
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  active_listings: number;
  active_listing_cap: number;
  contacts_this_month: number;
  monthly_contact_cap: number;
};

export type PublicProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  region_id: string | null;
  district_id: string | null;
  telegram_username: string | null;
  phone: string | null;
  created_at: string;
};

export type Book = {
  id: string;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publication_year: number | null;
  language: string | null;
  cover_url: string | null;
  page_count: number | null;
  description: string | null;
  source: MetadataSource;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** What the app sends when creating a canonical book record. */
export type BookInsert = Omit<Book, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export type Bookshelf = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  /** Set when shared with a household — every member can then see and edit it. */
  household_id: string | null;
};

export type BookshelfPosition = {
  id: string;
  user_id: string;
  bookshelf_id: string;
  shelf_number: number;
  row_number: number;
  label: string | null;
  created_at: string;
};

export type UserBook = {
  id: string;
  user_id: string;
  book_id: string;
  bookshelf_position_id: string | null;
  reading_status: ReadingStatus;
  condition: BookCondition | null;
  rating: number | null;
  review: string | null;
  notes: string | null;
  date_added: string;
  date_finished: string | null;
  availability_type: AvailabilityType;
  listed_at: string | null;
  exchange_preferences: string | null;
  sale_price: number | null;
  sale_currency: string;
  price_negotiable: boolean;
  sale_description: string | null;
  updated_at: string;
  /** Set when shared with a household — every member can then see and edit it. */
  household_id: string | null;
};

/** A row of the `library_entries` view — a copy joined to its book and shelf. */
export type LibraryEntry = {
  id: string;
  user_id: string;
  book_id: string;
  reading_status: ReadingStatus;
  condition: BookCondition | null;
  rating: number | null;
  review: string | null;
  notes: string | null;
  date_added: string;
  date_finished: string | null;
  availability_type: AvailabilityType;
  listed_at: string | null;
  exchange_preferences: string | null;
  sale_price: number | null;
  sale_currency: string;
  price_negotiable: boolean;
  sale_description: string | null;
  bookshelf_position_id: string | null;
  updated_at: string;

  title: string;
  subtitle: string | null;
  authors: string[];
  cover_url: string | null;
  isbn13: string | null;
  publisher: string | null;
  publication_year: number | null;
  language: string | null;
  page_count: number | null;
  description: string | null;

  bookshelf_id: string | null;
  bookshelf_name: string | null;
  bookshelf_sort_order: number | null;
  shelf_number: number | null;
  row_number: number | null;
  position_label: string | null;

  /** Whether the signed-in user may edit this book's shared metadata — set only when they created it. */
  book_created_by: string | null;

  /** Set when this copy is shared with a household. */
  household_id: string | null;
  /** Who added it — null for the signed-in user's own entries. */
  added_by_name: string | null;
  added_by_avatar_url: string | null;
};

export type HouseholdRole = 'owner' | 'member';

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type HouseholdMember = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
};

/** A row of the `listings` view — deliberately carries no private columns. */
export type Listing = {
  id: string;
  user_id: string;
  book_id: string;
  availability_type: AvailabilityType;
  condition: BookCondition | null;
  sale_price: number | null;
  sale_currency: string;
  price_negotiable: boolean;
  sale_description: string | null;
  exchange_preferences: string | null;
  listed_at: string | null;

  title: string;
  subtitle: string | null;
  authors: string[];
  cover_url: string | null;
  language: string | null;
  isbn13: string | null;
  publisher: string | null;
  publication_year: number | null;

  owner_name: string;
  owner_avatar_url: string | null;
  owner_region_id: string | null;
  owner_district_id: string | null;

  category_ids: string[] | null;
  photo_count: number;
};

export type ProfileStats = {
  user_id: string;
  total_books: number;
  finished_books: number;
  reading_books: number;
  exchange_count: number;
  sale_count: number;
  unread_books: number;
};

export type UserBookPhoto = {
  id: string;
  user_book_id: string;
  user_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
};

/** Return shape of the admin_list_reports() RPC — empty for a non-admin caller. */
export type AdminReport = {
  report_id: string;
  user_book_id: string;
  reason: string;
  details: string | null;
  resolved_at: string | null;
  created_at: string;
  reporter_id: string;
  reporter_name: string;
  book_title: string;
  owner_id: string;
  owner_name: string;
  availability_type: AvailabilityType;
};

/** Return shape of the request_contact() RPC. */
export type ContactDetails = {
  owner_name: string;
  telegram_username: string | null;
  phone: string | null;
};
