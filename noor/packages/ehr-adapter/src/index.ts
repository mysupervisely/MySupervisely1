export type {
  PatientDemographics,
  ExternalPatientRecord,
  ExternalConsent,
  PatientRecordProvider,
  DateRange,
  AvailabilitySlot,
  AppointmentRequest,
  ExternalAppointment,
  AppointmentProvider,
  OutboundClinicalMessage,
  ExternalMessage,
  ClinicalMessagingProvider,
  DocumentUpload,
  ExternalDocument,
  DocumentDownload,
  DocumentProvider,
  EhrProvider,
} from "./types.js";
export { createMockEhrProvider } from "./mock.js";
export { createEhrProvider } from "./factory.js";
export type { EhrProviderKey } from "./factory.js";
