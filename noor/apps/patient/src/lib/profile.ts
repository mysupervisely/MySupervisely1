// Re-exported from @noor/types so both apps/patient and apps/mobile share
// one definition of the profile shape and greeting logic (see
// docs/noor/M5-IMPLEMENTATION.md "Shared packages") — kept as a thin
// local re-export, rather than updating every importer to reach into
// @noor/types directly, so this file's existing import path
// (`../../lib/profile`) stays stable across the app.
export { timeOfDayGreeting } from "@noor/types";
export type { PatientProfileDTO as PatientProfile } from "@noor/types";
