---
name: hospital-qr-feedback
description: "Use when creating or extending a Laravel patient feedback system for Maison de Sante Innov Care: reception QR codes, mobile feedback pages, MariaDB/MySQL persistence, admin review, and branding based on the supplied logo."
---

# Hospital QR Feedback

Build a small, production-minded Laravel application that lets a patient scan a QR code at reception, open a mobile feedback page, and send a message about the hospital service. The target brand is **Maison de Sante Innov Care** and the supplied logo must remain the visual reference.

## Outcome

Deliver a working Laravel feature with:

- A public, mobile-first feedback page reachable from a QR code.
- A reception-facing QR page or downloadable QR asset for the feedback URL.
- A validated feedback form that accepts a message without requiring personally identifying data.
- A database record for each submission, including status and timestamps.
- A protected staff view for listing and updating feedback status.
- Branding that uses the supplied `logocare.jpg` and samples its orange, teal, and neutral tones rather than inventing an unrelated palette.
- Local Laragon setup instructions for the database and application.

## Workflow

### 1. Inspect before changing

- Check whether the workspace is already a Laravel application.
- Locate the supplied logo and inspect its dimensions and dominant colors.
- Identify the existing Laravel version, authentication approach, frontend stack, and database configuration.
- Reuse established layouts, components, routes, validation, and styling conventions when they exist.
- If the workspace is empty, scaffold the smallest Laravel application needed and keep the logo in `public/images/`.

### 2. Define the data contract

Use a migration and model for a `feedbacks` table with at least:

- `id`
- `message` as text
- `rating` as a nullable small integer constrained to the chosen range, if a rating is offered
- `service` or `location` as a nullable string when the hospital has multiple services
- `status` with a small explicit set such as `new`, `in_review`, and `resolved`
- `created_at` and `updated_at`

Do not collect a patient's name, phone number, medical record number, diagnosis, or other sensitive health information unless the user explicitly requests a compliant workflow for it. Add a short privacy notice near the form. Validate and normalize all user input server-side.

### 3. Build the public feedback flow

- Add a named GET route for the public form and a named POST route for submission.
- Use a stable, short URL that is suitable for a QR code, such as `/avis`.
- Show the hospital logo, the exact name “Maison de Sante Innov Care”, and a concise invitation to share feedback.
- Make the form usable on a phone with a large message field, clear labels, accessible focus states, and a visible success state after submission.
- Preserve validation errors and old input without exposing raw exception details.
- Add CSRF protection and basic abuse protection such as throttling or a honeypot; do not rely only on client-side validation.
- Keep the page usable with keyboard navigation and screen readers.

### 4. Generate and expose the QR code

- Use a maintained QR-code package compatible with the Laravel version instead of hand-writing QR encoding.
- Generate the QR from the configured application URL, never from a hard-coded localhost address.
- Include a reception view with the logo, the QR code, the destination URL, and a print-friendly layout.
- Keep the QR payload high contrast and free of decorative overlays that could reduce scan reliability.
- Test the QR payload by decoding it or checking the generated URL in an automated test.

### 5. Add staff review

- Reuse the existing authentication system when present. If there is no authentication, add the smallest protected staff mechanism supported by the project rather than exposing feedback publicly.
- Add a staff route to list feedback with newest first, status filtering, pagination, and a detail view if useful.
- Allow staff to change status through a validated request and authorize that action.
- Escape feedback content in the view and avoid rendering submitted text as HTML.
- Keep patient messages out of logs, analytics payloads, and QR contents.

### 6. Apply the visual language

- Use `logocare.jpg` as the source asset and preserve its aspect ratio.
- Build a restrained palette around the logo's warm orange and deep teal/green, with white and a soft neutral background for readability.
- Use strong contrast for text and controls; verify color contrast rather than trusting the logo colors blindly.
- Keep layouts calm and trustworthy: generous whitespace, clear hierarchy, modest border radii, and no medical claims.
- Ensure the feedback experience works at narrow mobile widths as well as desktop reception screens.

### 7. Configure Laragon and the database

- Document the database name, host, port, username, and password placeholders in `.env.example` without committing secrets.
- Provide the exact commands for `php artisan migrate`, starting the local app, and generating or viewing the QR page.
- Prefer MySQL/MariaDB settings that work with Laragon.
- Add seed data only if it is clearly marked as development data and contains no realistic patient information.

## Decision points

- **Existing Laravel app:** extend its conventions and authentication; do not replace the frontend stack.
- **Empty workspace:** create a minimal Laravel structure, install only required dependencies, and document prerequisites.
- **Need for ratings:** include an optional validated rating only when it helps the requested service review; otherwise keep the message flow simple.
- **Multiple services:** add a controlled service/location selector only when the hospital needs routing or comparison; otherwise avoid unnecessary personal or categorical data.
- **Staff access unavailable:** stop before exposing an unprotected inbox and document the required authentication setup.
- **Logo format unsupported by the chosen frontend:** convert only as a build asset when necessary; retain the original file and do not redraw the logo by hand.

## Completion checks

Run the checks appropriate to the project and report failures clearly:

- Laravel routes resolve for the public form, submission, QR page, and protected staff area.
- Migration runs on a fresh Laragon MySQL/MariaDB database.
- Feature tests cover valid submission, invalid/empty message, CSRF protection, persistence, and unauthorized staff access.
- A generated QR code points to the configured feedback URL.
- The success page does not resubmit on browser refresh.
- The feedback text is escaped in staff views.
- The logo loads from a stable public asset path and keeps its aspect ratio.
- The form is usable at mobile width and passes the project's available lint/type checks.
- No secrets, real patient data, or sensitive health details are committed.

## Suggested prompts

- “Crée l'application Laravel de feedback QR de Maison de Sante Innov Care dans ce workspace, puis exécute les migrations et les tests.”
- “Ajoute une page imprimable de QR code qui ouvre `/avis` et utilise `public/images/logocare.jpg`.”
- “Sécurise l'espace de lecture des avis et ajoute les tests d'autorisation.”
- “Adapte le formulaire mobile aux couleurs du logo sans collecter de données personnelles.”
