// EHR abstraction interfaces — docs/noor/ARCHITECTURE.md §G.
//
// Noor must be able to change EHR vendors without rewriting the
// application. These four interfaces are the ONLY place allowed to know a
// real EHR's API shape. No route handler, UI component, or business-logic
// function may import a vendor SDK directly — everything goes through
// these types, selected via the factory in factory.ts.
//
// M1 provides only MockProvider implementations (mock.ts) — see
// docs/noor/M1-IMPLEMENTATION.md. No real EHR vendor is integrated, and
// none of these interfaces are wired into any M1 API route yet (there is
// no appointment, document, or clinical-messaging feature in M1). This
// package exists in M1 purely to preserve the abstraction boundary defined
// in M0, per that milestone's explicit requirement, ahead of the features
// (M6+) that will actually call it.

export interface PatientDemographics {
  patientId: string; // Noor's own Patient.id
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // ISO date, optional — see brief §6
  state?: string;
}

export interface ExternalPatientRecord {
  externalId: string;
  demographics: PatientDemographics;
}

export interface ExternalConsent {
  externalId: string;
  type: string;
  grantedAt: string; // ISO datetime
}

export interface PatientRecordProvider {
  getPatientRecord(patientId: string): Promise<ExternalPatientRecord | null>;
  createOrLinkPatientRecord(patient: PatientDemographics): Promise<ExternalPatientRecord>;
  updateDemographics(patientId: string, demographics: Partial<PatientDemographics>): Promise<void>;
  getConsentsOnFile(patientId: string): Promise<ExternalConsent[]>;
}

export interface DateRange {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export interface AvailabilitySlot {
  clinicianId: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  appointmentType: string;
}

export interface AppointmentRequest {
  patientId: string;
  clinicianId: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  appointmentType: string;
}

export interface ExternalAppointment {
  externalId: string;
  patientId: string;
  clinicianId: string;
  start: string;
  end: string;
  status: "requested" | "confirmed" | "completed" | "canceled" | "no_show";
}

export interface AppointmentProvider {
  listAvailability(clinicianId: string, range: DateRange): Promise<AvailabilitySlot[]>;
  createAppointment(request: AppointmentRequest): Promise<ExternalAppointment>;
  cancelAppointment(externalAppointmentId: string, reason?: string): Promise<void>;
  getAppointment(externalAppointmentId: string): Promise<ExternalAppointment | null>;
}

export interface OutboundClinicalMessage {
  threadId?: string;
  fromUserId: string;
  toPatientId: string;
  body: string;
}

export interface ExternalMessage {
  externalId: string;
  threadId: string;
  fromUserId: string;
  body: string;
  sentAt: string; // ISO datetime
}

/**
 * Reserved for FUTURE true clinical messaging that must live in the EHR of
 * record. Noor Async's check-in/review flow (M3/M4) is Noor's own domain
 * data and does NOT route through this interface. Whether/when check-in
 * content ever syncs into an EHR at all is
 * [NEEDS CLINICAL/LEGAL REVIEW] — not assumed here or anywhere in M1.
 */
export interface ClinicalMessagingProvider {
  sendCareTeamMessage(message: OutboundClinicalMessage): Promise<ExternalMessage>;
  getMessages(threadId: string): Promise<ExternalMessage[]>;
}

export interface DocumentUpload {
  fileName: string;
  contentType: string;
  data: Uint8Array;
}

export interface ExternalDocument {
  externalId: string;
  fileName: string;
  contentType: string;
  uploadedAt: string; // ISO datetime
}

export interface DocumentDownload extends ExternalDocument {
  data: Uint8Array;
}

export interface DocumentProvider {
  uploadDocument(patientId: string, doc: DocumentUpload): Promise<ExternalDocument>;
  getDocument(externalDocumentId: string): Promise<DocumentDownload>;
  listDocuments(patientId: string): Promise<ExternalDocument[]>;
}

/** The full set of EHR-abstraction capabilities a provider implementation offers. */
export interface EhrProvider {
  patientRecords: PatientRecordProvider;
  appointments: AppointmentProvider;
  clinicalMessaging: ClinicalMessagingProvider;
  documents: DocumentProvider;
}
