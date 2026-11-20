# Event galleries and resources

Implements F06 / AT-10 against the v2.0.0 draft planning baseline. Only external link metadata is stored in MAIN. Photos remain in Google Photos; resources remain in Drive or an external destination approved by the admin adding the link. OD PDFs remain announcement links.

## Setup and verification

Use the explicit MAIN working directory and development project from [Supabase setup](supabase-setup.md) and [database events](database-events.md). Migration `supabase/main/supabase/migrations/20261120060000_event_materials.sql` was reviewed and applied to linked MAIN on 20 November 2026. The rollback security suite passed 49 checks. See [phase.md](../../phase.md) for validation evidence and remaining release checks.

Run `supabase/main/supabase/tests/event_materials.sql` against MAIN using the existing development SQL runner. It creates fixtures inside a transaction and rolls them back. Assertions cover anonymous/student/admin permissions, revoked admin authority, direct-write denial, hidden/draft isolation, event associations, ordering, validation and create/update/delete audits. Do not run fixture tests against production.

Both apps expose `/events/<event UUID>/materials`. In Launchpad Control, sign in as a currently authorized admin, open the event's gallery/resources page, add a label, choose Resource or Google Photos album, enter an HTTPS URL and an integer display order, and explicitly choose whether to publish it. New links default to hidden. Edit changes all mutable values; removal requires an inline confirmation. Links cannot be moved between events.

In Launchpad, sign in as a student, open the same event's gallery/resources page, and verify only published links appear, ordered by display order then UUID. A draft or unavailable event must not expose material metadata through either the screen or direct API requests. Test the empty, failed-load/retry, failed-save and unauthorized account states. Open a gallery and resource link and verify the external destination and sharing permissions with a real student account.

## Backend contract

`public.event_materials`: UUID `id`, `event_id`, `created_by`; text `kind` (`gallery` or `resource`), `label`, `url`; boolean `published`; integer `display_order`; timestamptz `created_at`, `updated_at`.

Authenticated reads use RLS. Students see a material only when it is published and the associated event is visible and not draft. Admins can read hidden links and draft-event links. Direct frontend inserts, updates and deletes are denied for both roles.

- `admin_save_event_material(p_event_id uuid, p_kind text, p_label text, p_url text, p_published boolean, p_display_order integer, p_id uuid default null)` returns the saved row. Omit `p_id` to create; pass an existing same-event ID to edit.
- `admin_delete_event_material(p_event_id uuid, p_id uuid)` returns void.

Both RPCs acquire the shared admin-authority transaction lock, check current server-side authority and audit actor, time, event and old/new metadata. No service key is needed in either browser. SQL rejects empty/oversized labels, controls, unknown kinds, missing visibility/order, invalid HTTPS hosts/ports, credentials, spaces and backslashes. Gallery destinations must be `photos.app.goo.gl/<album token>` or `photos.google.com/album/<token>` / `photos.google.com/share/<token>`; no Google Photos API is used.

## External permissions and release limits

Before publishing, an admin must open each URL and verify its audience and destination. URL validation cannot prove that a remote album exists, that Drive sharing is correct, or that a resource remains appropriate after an external owner changes it. Anyone-with-link destinations can be forwarded outside Launchpad. Use institution-approved restricted sharing for sensitive materials; app publication does not confer private-file access control.

No uploads, storage buckets, file copies, new services or OD records are introduced. Local real browser/API workflows and SQL authorization checks passed as recorded in phase.md. Deployed-origin and real external-sharing checks remain before claiming release readiness. Record actual executed checks in release evidence; source review alone is insufficient.
