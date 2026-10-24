# FaceHelper product guidance

FaceHelper is an assistive Progressive Web App for people with prosopagnosia (face blindness). It helps a user recognize people they have deliberately enrolled, but it is not a medical device and must not be presented as a diagnosis or a guaranteed identification system.

## Product principles

- Optimize for a private, calm, low-friction mobile experience on iPhone and Android.
- No account or authentication is required.
- Keep face processing and enrolled profiles on the user's device. Do not upload camera frames or biometric profiles.
- Prefer **Unknown** over a confident incorrect identity. A false identification can be more harmful than no identification.
- Support multiple faces in view and optional spoken names.
- Make enrollment explicit: name the person, provide at least three clear face samples, then save locally.
- Provide gallery controls to review, rename, and delete enrolled profiles.
- Remind contributors that consent and biometric privacy obligations may apply depending on jurisdiction and use.

## Experience requirements

- Design mobile-first while retaining a polished desktop layout.
- Preserve browser zoom, keyboard navigation, visible focus, screen-reader status updates, reduced-motion behavior, and touch targets of at least 44 CSS pixels.
- Account for iOS and Android safe areas and installed-PWA display modes.
- Release camera streams when the user changes modes, backgrounds the app, or leaves the page.
