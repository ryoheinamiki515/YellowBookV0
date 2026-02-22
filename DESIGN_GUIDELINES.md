# YellowBook Design Principles & Guidelines

> A living reference for anyone designing or building UI for YellowBook.
> Every pixel should help someone feel closer to the people they care about—then get out of the way.

---

## 1. Design Philosophy

YellowBook is a **calm notebook**, not a social app. Every design decision flows from one question:

**"Does this help someone maintain a meaningful relationship with less effort, less guilt, and more joy?"**

If the answer is no, it doesn't ship.

### Core Design Pillars

| Pillar | What It Means | What It Rejects |
|--------|--------------|-----------------|
| **Calm** | Quiet surfaces, generous breathing room, unhurried interactions | Visual noise, competing CTAs, information overload |
| **Warm** | Soft palette, friendly type, human language | Sterile corporate UI, cold minimalism, robotic copy |
| **Trustworthy** | Obvious controls, plain language, no surprises | Dark patterns, hidden menus, manipulative nudges |
| **Intentional** | Every element earns its place; nothing decorative without purpose | Feature creep, badge pollution, dashboard syndrome |

### The Notebook Metaphor

Think of YellowBook as a **well-loved Moleskine** — personal, tactile, analog-feeling even though it's digital. Users should feel like they're flipping through *their own* pages, not scrolling a feed.

---

## 2. Color System

### Palette Philosophy

YellowBook's palette is **warm-neutral with a single accent**. We lean into yellows and warm grays to feel approachable without being childish. The palette should feel like afternoon light on paper.

### Semantic Color Roles

| Role | Usage | Notes |
|------|-------|-------|
| **Background** | Page canvas, card backgrounds | Warm off-whites — never pure `#ffffff` |
| **Surface** | Cards, sheets, elevated containers | Slightly lighter/darker than background for depth |
| **Primary** | Key actions (save, reach out, confirm) | Warm gold/amber — the "yellow" in YellowBook |
| **Secondary** | Supporting actions, toggles, chips | Muted warm tone — doesn't compete with primary |
| **Text Primary** | Headings, body copy, labels | Dark warm gray — never pure black |
| **Text Secondary** | Captions, timestamps, helper text | Medium warm gray — clearly subordinate |
| **Text Tertiary** | Placeholders, disabled labels | Light gray — present but unobtrusive |
| **Border** | Dividers, input outlines, card edges | Very subtle — structure without rigidity |
| **Success** | Confirmations, completed states | Soft sage green — celebratory without being loud |
| **Caution** | Gentle alerts, soft warnings | Warm amber — informative, never alarming |
| **Destructive** | Delete, remove (rare — always with confirmation) | Muted coral/rose — serious but not aggressive |

### Color Rules

1. **No pure black or pure white.** Use warm-shifted variants. Pure extremes feel clinical.
2. **Accent sparingly.** Primary color appears on 1-2 interactive elements per screen, max.
3. **Dark mode is not inverted light mode.** Dark mode gets its own tuned palette — darker warm grays, desaturated accents, reduced contrast on non-essential elements.
4. **Accessible contrast.** All text meets WCAG AA (4.5:1 for body, 3:1 for large text). Test with a contrast checker, not your eyes.
5. **Color is never the only signal.** Pair color with icons, labels, or shape changes for colorblind users.

---

## 3. Typography

### Typeface: DM Sans

**DM Sans** is our sole typeface. It's geometric but friendly — clean without being cold. No secondary typefaces.

### Type Scale

Use a limited, intentional scale. Every size has a job.

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| **Display** | 28–32 | Bold (700) | Splash screens, onboarding headlines |
| **Title** | 22–24 | SemiBold (600) | Screen titles, section headers |
| **Heading** | 18–20 | SemiBold (600) | Card titles, group labels |
| **Body** | 15–16 | Regular (400) | Primary content, descriptions, notes |
| **Label** | 13–14 | Medium (500) | Buttons, input labels, tab labels |
| **Caption** | 12 | Regular (400) | Timestamps, secondary info, helper text |
| **Overline** | 11 | Medium (500) | Section overlines, metadata tags (uppercase sparingly) |

### Typography Rules

1. **Two weights per screen, max.** Hierarchy comes from size and color, not from mixing four weights.
2. **Line height is generous.** Body text: 1.5x. Headings: 1.2–1.3x. Dense text feels stressful.
3. **No ALL CAPS except overlines.** Uppercase feels like shouting — the opposite of our tone.
4. **Left-align everything.** Center-alignment is reserved for empty states and onboarding hero text only.
5. **Truncation over wrapping for single-line items.** Friend names, plan titles — truncate with ellipsis rather than breaking layout.

---

## 4. Spacing & Layout

### Spacing Scale

Use a **4px base unit** with a consistent scale:

| Token | Value | Common Usage |
|-------|-------|-------------|
| `xs` | 4px | Icon-to-label gap, tight internal padding |
| `sm` | 8px | Between related elements within a group |
| `md` | 12px | Card internal padding, input padding |
| `lg` | 16px | Between groups, section padding |
| `xl` | 24px | Between sections, screen edge padding |
| `2xl` | 32px | Major section breaks |
| `3xl` | 48px | Screen-level vertical separation |

### Layout Principles

1. **Screen edge padding: 20–24px.** Consistent on every screen. Content never touches the edge.
2. **Cards breathe.** Internal padding: 16px minimum. Cards stacked vertically get 12px gaps.
3. **Group by proximity.** Related items are close; unrelated items have clear space between them. No need for divider lines when spacing does the job.
4. **Single-column by default.** Mobile is vertical. Resist the urge to grid things side-by-side unless there's a clear spatial relationship (e.g., two action buttons).
5. **Scroll is fine.** Don't cram everything above the fold. A calm scroll is better than a cramped screen.

---

## 5. Components

### Buttons

| Variant | When to Use | Visual Treatment |
|---------|-------------|-----------------|
| **Primary** | One main action per screen (e.g., "Save", "Reach Out") | Filled with primary color, rounded corners, medium weight label |
| **Secondary** | Supporting actions (e.g., "Edit", "Add Note") | Outlined or ghost style, subtle hover/press state |
| **Tertiary** | Low-emphasis actions (e.g., "Cancel", "Skip") | Text-only, no border, muted color |
| **Destructive** | Delete or remove (always with confirmation) | Muted coral fill or outline, never bright red |

**Button Rules:**
- Minimum touch target: **44x44px** (Apple HIG). No exceptions.
- Rounded corners: consistent radius across all buttons (8–12px).
- One primary button per screen. If there are two equally important actions, rethink the screen.
- Button labels are **verbs**: "Save Note", "Add Friend" — not "Submit", "OK", "Next".

### Cards

Cards are the primary container for friend entries, plans, and notes.

- **Soft shadow or subtle border** — not both. Pick one elevation strategy and use it everywhere.
- **No card nesting.** A card inside a card is a sign the information architecture needs work.
- **Tap target is the whole card** when the card leads to a detail view. Don't make users find a tiny chevron.
- **Rounded corners: 12–16px.** Softer corners reinforce the warm, friendly feel.

### Inputs

- **Generous padding** inside input fields (12–16px vertical, 16px horizontal).
- **Placeholder text is not a label.** Always show a persistent label above or beside the input.
- **Border on focus:** a warm, visible focus ring — not just a color change. Accessibility matters.
- **Error states are gentle.** Use warm language: "Hmm, that doesn't look right" over "Invalid input."

### Lists

- **No zebra striping.** Use spacing to separate items, not alternating backgrounds.
- **Swipe actions are secondary.** The primary interaction is always a tap. Swipe-to-delete or swipe-to-archive is a shortcut, not the only path.
- **Empty states are warm.** Never "No data found." Try: "No friends added yet — add someone you'd like to stay close with."

### Bottom Sheets & Modals

- **Bottom sheets over modals** on mobile. They feel more natural and are easier to dismiss.
- **Always dismissible.** Drag down or tap outside to close. Never trap users.
- **Max height: 70% of screen.** If a bottom sheet needs more space, it should be a full screen.

---

## 6. Iconography

### Style

- **Outlined, rounded** icon style (not filled, not sharp). Matches the soft, approachable tone.
- **Stroke width: 1.5–2px.** Consistent across all icons.
- **Size: 20–24px** for inline/nav icons. 32–48px for empty states or feature illustrations.

### Usage Rules

1. **Icons support text; they don't replace it.** Every icon should have a label (visible or accessible). Icon-only buttons are allowed only for universally understood actions (close, back, search).
2. **No icon overload.** If a screen has more than 5–6 distinct icons, simplify.
3. **Consistent metaphors.** Pick one icon per concept and use it everywhere. Don't use a heart *and* a star for "favorite."

---

## 7. Motion & Animation

### Philosophy

Motion in YellowBook is **functional and calming**. It should orient the user, not entertain them.

### Guidelines

| Type | Duration | Easing | Example |
|------|----------|--------|---------|
| **Micro-interactions** | 150–200ms | ease-out | Button press, toggle, checkbox |
| **Transitions** | 250–350ms | ease-in-out | Screen transitions, bottom sheet open |
| **Entrance** | 200–300ms | ease-out | Cards appearing, list items loading |
| **Exit** | 150–200ms | ease-in | Dismissing a sheet, removing an item |

### Motion Rules

1. **No bouncing, no springs, no playful physics.** YellowBook is calm, not cute.
2. **Exits are faster than entrances.** Getting out of the way quickly respects the user's intent.
3. **One animation at a time.** Never animate multiple elements independently — it creates visual chaos.
4. **Reduce motion support.** Respect the OS-level "Reduce Motion" setting. Replace animations with simple fades.
5. **Loading states are gentle.** Soft skeleton screens or a subtle pulse — never a spinner with "Loading..." text. If something takes more than 2 seconds, show a calm placeholder.

---

## 8. Tone of Voice in UI

The way we write is as important as how we design. YellowBook speaks like a **thoughtful friend**, not a product manager.

### Writing Principles

| Do | Don't |
|----|-------|
| "No pressure — reach out when it feels right." | "You haven't contacted Sarah in 47 days." |
| "Add a little note to remember next time." | "Enter contact notes (required)." |
| "You're all caught up." | "No pending tasks." |
| "Want to add anyone?" | "Your friend list is empty." |
| "Saved." | "Your changes have been successfully saved." |

### Specific Patterns

- **Confirmations are brief.** One word or a short phrase. "Saved." "Done." "Added."
- **Errors are human.** "Something went wrong — try again?" not "Error 500: Internal Server Error."
- **Empty states are invitations.** Every empty state is a chance to gently guide, not a dead end.
- **No exclamation marks in the UI.** They create urgency and excitement we don't want. The one exception: celebrating a user's action ("Nice!").
- **Time references are relative and soft.** "A few weeks ago" over "23 days ago." Exact dates appear only when the user explicitly asks or drills in.

---

## 9. Interaction Patterns

### Haptics

- **Light haptic on successful actions** (save, add, complete). A subtle confirmation that something happened.
- **No haptics on navigation.** Tapping into a screen doesn't need feedback beyond the visual transition.
- **Medium haptic on destructive actions.** The slight bump before a delete confirmation reinforces the weight of the action.

### Gestures

- **Swipe gestures are always optional shortcuts.** Every swipe action must also be available via a visible button or menu.
- **Pull-to-refresh is allowed** but don't show a "last updated" timestamp. It adds unnecessary anxiety.
- **Long-press for secondary options.** But always provide an alternative path (e.g., a "..." menu).

### Navigation

- **Flat hierarchy.** Ideally max 2 levels deep from the home screen. Deep nesting makes people feel lost.
- **Back always works.** Every screen has a clear way to go back. No dead ends.
- **Tab bar over hamburger menu.** Visible navigation beats hidden navigation. Limit to 3–5 tabs.
- **Preserve scroll position** when navigating back. Don't reset the user's place.

---

## 10. Accessibility

Accessibility is not a checklist — it's a design constraint we embrace from the start.

### Non-Negotiables

1. **Touch targets: 44x44px minimum.** This is not a suggestion.
2. **Color contrast: WCAG AA.** All text. All interactive elements. Test it.
3. **Screen reader support.** Every interactive element has an accessible label. Every image has alt text. Test with VoiceOver/TalkBack.
4. **Dynamic type support.** Layouts must adapt to the user's preferred text size without breaking. Test at 200% font scale.
5. **Focus order is logical.** Tab/swipe through a screen — does the order make sense?
6. **No information conveyed by color alone.** Pair with icons, text, or patterns.

### Best Practices

- Use semantic elements (headings, buttons, links) — not styled divs or touchable opacity wrappers pretending to be buttons.
- Announce state changes to screen readers (e.g., "Note saved", "Friend added").
- Ensure all animations can be disabled via Reduce Motion.
- Test on actual devices, not just simulators.

---

## 11. Dark Mode

Dark mode is not an afterthought — it's a first-class experience.

### Principles

1. **Not inverted.** Dark mode has its own carefully tuned palette — not a CSS `filter: invert()`.
2. **Reduce vibrancy.** Desaturate accent colors slightly in dark mode. Bright colors on dark backgrounds cause visual strain.
3. **Elevation through lightness.** In dark mode, higher surfaces are *lighter* (not darker). This replaces shadow-based elevation.
4. **Pure black sparingly.** Use dark warm grays (`#1a1a1a`–`#2a2a2a`) for backgrounds. Reserve `#000000` for OLED-specific optimizations only.
5. **Test both themes equally.** No feature ships without being reviewed in both light and dark mode.

---

## 12. Design Process & Collaboration

### Before You Design

1. **Read the README.** Every design must align with the product principles. Print them out if you need to.
2. **Check existing patterns.** Before inventing a new component or interaction, check if something similar already exists. Consistency over novelty.
3. **Think in tokens.** Design using the spacing scale, type scale, and color roles — not arbitrary values. If a design requires a new token, that's a conversation with the team.

### Design Reviews

Every design review should answer:

- **Does it feel calm?** Would you feel relaxed using this at 11pm on a Sunday?
- **Is there unnecessary urgency?** Countdown timers, red badges, "action required" — remove them.
- **Can the user leave?** Every screen should make it easy to close, go back, or do nothing.
- **What happens when it's empty?** Design the empty state first — it's the first thing new users see.
- **What happens with extreme content?** 1 friend vs. 200. A 3-word note vs. a paragraph. A name with 40 characters.
- **Does it work in dark mode?** Check it.
- **Does it pass the "creep test"?** Would you feel uncomfortable if this app showed this to you about someone else? If yes, redesign.

### Handoff Expectations

- Use **Tamagui tokens** in specs — not raw pixel values or hex codes.
- Annotate **states**: default, pressed, disabled, loading, error, empty.
- Specify **accessibility labels** for interactive elements.
- Include **real content** in mocks — not "Lorem ipsum" or "User Name."
- Call out **edge cases**: what happens with 0 items? 1 item? 100 items? No network?

---

## Quick Reference Card

```
Font:           DM Sans (400, 500, 600, 700)
Base unit:      4px
Screen padding: 20–24px
Card radius:    12–16px
Button radius:  8–12px
Touch target:   44px min
Contrast:       WCAG AA (4.5:1 body, 3:1 large)
Animations:     150–350ms, ease-out / ease-in-out
Max depth:      2 levels from home
Tabs:           3–5 max
Primary CTA:    1 per screen
```

---

*This document is a living reference. If something feels wrong, raise it. If a rule blocks a better user experience, challenge it. The guidelines serve the user — not the other way around.*
