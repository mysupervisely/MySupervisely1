# storage/

AsyncStorage-backed repositories (M6). Not implemented in M1 — no on-device persistence exists
yet, including onboarding name entry, which in M1 is UI-only and does not persist.

Planned for M6: one repository per domain (attempts, exam progress, lesson completion,
onboarding, access token), a versioned schema with a migration runner, and no scattered
`AsyncStorage.getItem`/`setItem` calls in screen components (Phase 9).
