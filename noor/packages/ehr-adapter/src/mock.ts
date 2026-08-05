// In-memory MockProvider — the only EhrProvider implementation that exists
// in M1. Lets the rest of the app be built and tested end-to-end against a
// stable interface before a real EHR contract exists (docs/noor/
// ARCHITECTURE.md §G). Data lives only in process memory; nothing here
// persists to Postgres or any external system, and nothing in M1 calls it.

import { randomUUID } from "node:crypto";
import type {
  AppointmentProvider,
  AppointmentRequest,
  AvailabilitySlot,
  ClinicalMessagingProvider,
  DateRange,
  DocumentDownload,
  DocumentProvider,
  DocumentUpload,
  EhrProvider,
  ExternalAppointment,
  ExternalConsent,
  ExternalDocument,
  ExternalMessage,
  ExternalPatientRecord,
  OutboundClinicalMessage,
  PatientDemographics,
  PatientRecordProvider,
} from "./types.js";

class MockPatientRecordProvider implements PatientRecordProvider {
  private records = new Map<string, ExternalPatientRecord>();

  async getPatientRecord(patientId: string): Promise<ExternalPatientRecord | null> {
    return this.records.get(patientId) ?? null;
  }

  async createOrLinkPatientRecord(patient: PatientDemographics): Promise<ExternalPatientRecord> {
    const record: ExternalPatientRecord = { externalId: `mock-ehr-patient-${randomUUID()}`, demographics: patient };
    this.records.set(patient.patientId, record);
    return record;
  }

  async updateDemographics(patientId: string, demographics: Partial<PatientDemographics>): Promise<void> {
    const existing = this.records.get(patientId);
    if (!existing) return;
    this.records.set(patientId, { ...existing, demographics: { ...existing.demographics, ...demographics } });
  }

  async getConsentsOnFile(_patientId: string): Promise<ExternalConsent[]> {
    return [];
  }
}

class MockAppointmentProvider implements AppointmentProvider {
  private appointments = new Map<string, ExternalAppointment>();

  async listAvailability(_clinicianId: string, _range: DateRange): Promise<AvailabilitySlot[]> {
    return [];
  }

  async createAppointment(request: AppointmentRequest): Promise<ExternalAppointment> {
    const appointment: ExternalAppointment = {
      externalId: `mock-ehr-appt-${randomUUID()}`,
      patientId: request.patientId,
      clinicianId: request.clinicianId,
      start: request.start,
      end: request.end,
      status: "requested",
    };
    this.appointments.set(appointment.externalId, appointment);
    return appointment;
  }

  async cancelAppointment(externalAppointmentId: string, _reason?: string): Promise<void> {
    const appointment = this.appointments.get(externalAppointmentId);
    if (appointment) appointment.status = "canceled";
  }

  async getAppointment(externalAppointmentId: string): Promise<ExternalAppointment | null> {
    return this.appointments.get(externalAppointmentId) ?? null;
  }
}

class MockClinicalMessagingProvider implements ClinicalMessagingProvider {
  private messages = new Map<string, ExternalMessage[]>();

  async sendCareTeamMessage(message: OutboundClinicalMessage): Promise<ExternalMessage> {
    const threadId = message.threadId ?? `mock-ehr-thread-${randomUUID()}`;
    const sent: ExternalMessage = {
      externalId: `mock-ehr-msg-${randomUUID()}`,
      threadId,
      fromUserId: message.fromUserId,
      body: message.body,
      sentAt: new Date().toISOString(),
    };
    const existing = this.messages.get(threadId) ?? [];
    existing.push(sent);
    this.messages.set(threadId, existing);
    return sent;
  }

  async getMessages(threadId: string): Promise<ExternalMessage[]> {
    return this.messages.get(threadId) ?? [];
  }
}

class MockDocumentProvider implements DocumentProvider {
  private documents = new Map<string, DocumentDownload>();
  private byPatient = new Map<string, string[]>();

  async uploadDocument(patientId: string, doc: DocumentUpload): Promise<ExternalDocument> {
    const externalId = `mock-ehr-doc-${randomUUID()}`;
    const record: DocumentDownload = {
      externalId,
      fileName: doc.fileName,
      contentType: doc.contentType,
      uploadedAt: new Date().toISOString(),
      data: doc.data,
    };
    this.documents.set(externalId, record);
    const list = this.byPatient.get(patientId) ?? [];
    list.push(externalId);
    this.byPatient.set(patientId, list);
    return record;
  }

  async getDocument(externalDocumentId: string): Promise<DocumentDownload> {
    const record = this.documents.get(externalDocumentId);
    if (!record) throw new Error(`Mock document ${externalDocumentId} not found`);
    return record;
  }

  async listDocuments(patientId: string): Promise<ExternalDocument[]> {
    const ids = this.byPatient.get(patientId) ?? [];
    return ids.map((id) => this.documents.get(id)).filter((d): d is DocumentDownload => Boolean(d));
  }
}

export function createMockEhrProvider(): EhrProvider {
  return {
    patientRecords: new MockPatientRecordProvider(),
    appointments: new MockAppointmentProvider(),
    clinicalMessaging: new MockClinicalMessagingProvider(),
    documents: new MockDocumentProvider(),
  };
}
