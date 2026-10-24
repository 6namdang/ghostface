# FaceHelper development workflow

## Source control

- Always create a new branch for every change.
- Never commit or push directly to `main`.
- Open a pull request into `main` and use the Vercel preview before merging.
- Keep each pull request focused and document what changed, what was validated, and what requires physical-device testing.

## Quality bar

- Preserve recognition, enrollment, gallery, speech, IndexedDB, and offline behavior when changing the interface.
- Use explicit event listeners rather than inline HTML handlers.
- Use semantic controls and accessible dialog/status patterns.
- Verify JavaScript syntax, JSON validity, DOM ID consistency, duplicate IDs, and whitespace before committing.
- For UI changes, inspect desktop and mobile browser renders and test compact widths down to 320 CSS pixels without horizontal overflow.
- For service-worker changes, verify first install, cache upgrade behavior, and an offline reload.
- Do not claim real-camera or real-model validation when only mocks were exercised.

## Safety and product language

- Describe FaceHelper as an assistive tool, not a medical device.
- Do not claim legal compliance by design. State that biometric privacy and consent obligations vary by jurisdiction.
- Do not claim the current face-api model is ArcFace.
