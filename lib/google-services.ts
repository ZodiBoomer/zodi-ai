export const GOOGLE_SERVICES = {
  gmail: {
    label: "Gmail",
    description: "Lire les messages et les conversations.",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"]
  },
  drive: {
    label: "Google Drive",
    description: "Accéder aux fichiers que tu ouvres ou crées avec Zodi AI.",
    scopes: ["https://www.googleapis.com/auth/drive.file"]
  },
  calendar: {
    label: "Google Agenda",
    description: "Consulter tes événements et ton planning.",
    scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"]
  },
  contacts: {
    label: "Google Contacts",
    description: "Consulter tes contacts.",
    scopes: ["https://www.googleapis.com/auth/contacts.readonly"]
  }
} as const;

export type GoogleService = keyof typeof GOOGLE_SERVICES;

export function isGoogleService(value: string): value is GoogleService {
  return Object.prototype.hasOwnProperty.call(GOOGLE_SERVICES, value);
}
