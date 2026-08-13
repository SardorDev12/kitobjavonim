-- =============================================================================
-- Raises both plans' caps to 100/100 for the pre-launch/growth phase — the app
-- should feel unrestricted while we're still building a user base, not gate
-- anyone this early. Pure data change: plan_limits exists precisely so this
-- is an UPDATE, not a schema migration (see 0008's comment).
-- =============================================================================

update plan_limits
set active_listing_cap = 100,
    monthly_contact_cap = 100
where plan in ('free', 'pro');
