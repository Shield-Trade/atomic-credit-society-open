# Design System Specification: Agent-Driven Transaction Console

## 1. Overview & Creative North Star
### The Creative North Star: "The Digital Sovereign"
This design system moves away from the generic "SaaS dashboard" and toward a high-fidelity, editorial console. We are building for an elite user—the Agent Operator. The aesthetic is **Technical Sophistication meets Sovereign Authority**.

To break the "template" look, this system utilizes **Intentional Asymmetry** and **Tonal Depth**. We prioritize breathing room (whitespace) over grid density. Elements shouldn't just sit on a page; they should feel like curated modules within a high-performance engine. By utilizing overlapping glass layers and high-contrast typography scales, we create an interface that feels bespoke, expensive, and intentionally engineered.

---

## 2. Colors
Our palette is rooted in deep obsidian tones (`surface: #12121d`) punctuated by electric purples and functional golds.

### The "No-Line" Rule
**Strict Prohibition:** Designers are prohibited from using 1px solid borders to section off content. 
Boundaries must be defined solely through:
*   **Background Color Shifts:** Use a `surface_container_low` section sitting against a `surface` background.
*   **Tonal Transitions:** Defining edges through subtle contrast rather than structural lines.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of frosted obsidian. 
*   **Nesting Logic:** Place a `surface_container_high` element inside a `surface_container` area to denote a "raised" priority. 
*   **Depth Flow:** As information becomes more specific (e.g., a "Claim Agent" form inside a dashboard section), the container should move toward a "Higher" tier to create a soft, natural lift.

### The "Glass & Gradient" Rule
To elevate beyond flat UI, use **Glassmorphism** for floating elements (Tooltips, Modals, Hover States). 
*   **Implementation:** Use semi-transparent versions of `surface_variant` with a 12px to 20px `backdrop-blur`.
*   **Signature Textures:** For primary actions, use a linear gradient transitioning from `primary` (#ffba38) to `primary_container` (#815800). This adds a "metallic" gold soul to the interface that a flat hex code cannot achieve.

---

## 3. Typography
We use a tri-font system to establish an editorial hierarchy.

*   **Display & Headlines (Space Grotesk):** This is our technical voice. Use `display-lg` for high-impact numbers (like Credit Scores) and `headline-sm` for section titles. Its wide, geometric stance feels architectural.
*   **Titles & Body (Manrope):** Our functional workhorse. Manrope provides superior legibility at smaller scales while maintaining a modern, humanist touch. Use `title-md` for card headers.
*   **Labels (Inter):** Reserved for technical metadata, micro-copy, and form labels. `label-sm` is utilized for status tags (e.g., "Transaction Pending") to ensure precision.

**Hierarchy Strategy:** Always pair a `display-sm` (Space Grotesk) value with `label-md` (Inter) subtext. The contrast between the aggressive geometry of the headline and the neutral clarity of the label creates the "High-End Editorial" feel.

---

## 4. Elevation & Depth
Depth is a functional tool for cognitive load management, not just decoration.

*   **The Layering Principle:** Avoid shadows where background color shifts can do the work. A `surface_container_lowest` card nested within a `surface_container_low` dashboard creates a "recessed" effect that feels integrated.
*   **Ambient Shadows:** For floating components (like the "Agent Token" dropdown), use extra-diffused shadows. 
    *   *Spec:* `Y: 8px, Blur: 24px, Color: #000000 at 8% opacity`. The shadow should feel like a soft glow of dark light.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, it must be a "Ghost Border." Use `outline_variant` at 15% opacity. Never use 100% opaque borders.
*   **Glassmorphism Depth:** When using glass layers for the "Agent-Driven Transaction Console" header, ensure the `surface_tint` (#ffba38) is used at a 2% opacity overlay to give the glass a subtle warmth.

---

## 5. Components

### Buttons
*   **Primary (Gold):** Linear gradient (`primary` to `primary_container`). Use `xl` (0.75rem) roundedness. Text is `on_primary_fixed` for maximum contrast.
*   **Secondary (Purple):** Ghost style with a `secondary` (#cfbdff) Ghost Border. 
*   **Tertiary:** No background. Use `tertiary` (#00daf3) text with an underline on hover.

### Cards & Lists
*   **Rule:** Forbid the use of divider lines. 
*   **Content Separation:** Use a `16` (3.5rem) vertical spacing scale gap or a subtle shift from `surface_container` to `surface_container_high`.
*   **Transaction Status Item:** Use a `surface_container_low` background with a `4` (0.9rem) padding. Indicators for status should be subtle glows, not heavy solid circles.

### Input Fields (Claim Agent & Agent Token)
*   **Style:** Minimalist. Use `surface_container_highest` as the fill. 
*   **Focus State:** Instead of a thick border, use a subtle 1px "Ghost Border" of `primary` (#ffba38) and a faint outer glow of the same color at 10% opacity.

### Chips (Transaction Status)
*   **Selection:** Use `secondary_container` with `on_secondary_container` text.
*   **Sizing:** Keep them compact using `label-sm` typography and `full` roundedness.

---

## 6. Do's and Don'ts

### Do
*   **DO** use intentional asymmetry. For example, the "Credit History" card can be wider than the "Borrow History" card to create a rhythmic, non-linear layout.
*   **DO** use `surface_bright` sparingly as a "spotlight" background for the most important active transaction.
*   **DO** ensure all glassmorphic elements have a `backdrop-filter: blur(16px)` to maintain legibility over complex backgrounds.

### Don't
*   **DON'T** use 1px solid borders to separate navigation from content. Use a `surface_container_lowest` sidebar against a `surface` main area.
*   **DON'T** use pure white (#FFFFFF) for text. Use `on_surface_variant` (#c7c4d8) for body text to reduce eye strain and maintain the premium dark-mode feel.
*   **DON'T** crowd the layout. If the "Transaction Status" list feels full, increase the spacing to `8` or `10` rather than adding lines.

---

## 7. Signature Elements for This Console
*   **Agent Identity Glow:** When an agent is "Claimed," the card should feature a subtle `secondary` (#cfbdff) radial gradient in the top-right corner at 5% opacity.
*   **Credit History Micro-Graph:** Use `tertiary` (#00daf3) for positive trends and `error` (#ffb4ab) for dips, rendered as 2px thick paths with no fills.