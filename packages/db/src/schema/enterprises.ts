import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './helpers';

// The scope of an architecture effort: one or more organizations (or parts of
// them) pursuing a shared goal — a corporate group, a cross-company
// collaboration, a household. Every modeled entity belongs to exactly one
// enterprise; overlap between enterprises is expressed with correspondence
// links between their models, never by sharing rows (see docs/VISION.md).
export const enterprises = pgTable('enterprises', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  // The shared goal that defines the scope — part of the definition of an
  // enterprise, not documentation.
  goal: text('goal'),
  // Free-form hex colors for the enterprise switcher's avatar. Nullable —
  // unset means "use the app's neutral default", not "black"; the UI adds
  // a themed border around the avatar regardless, so a user-chosen white
  // or black still reads against the sidebar in both light and dark mode.
  avatarBgColor: text('avatar_bg_color'),
  avatarTextColor: text('avatar_text_color'),
  ...timestamps,
});
