import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGoogleAccessToken } from "@/lib/google-access-token";
import { isGoogleService } from "@/lib/google-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ service: string }> };
type GoogleApiError = { error?: { message?: string; status?: string } };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null ? fallback : Number(value);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

async function googleGet<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000)
  });
  const data = await response.json().catch(() => ({})) as T & GoogleApiError;
  if (!response.ok) {
    const message = data.error?.message || "Google API request failed";
    throw new Error("GOOGLE_API_" + response.status + ":" + message);
  }
  return data;
}

async function listGmail(accessToken: string, params: URLSearchParams) {
  const maxResults = boundedInteger(params.get("maxResults"), 10, 1, 20);
  if (maxResults === null) throw new Error("INVALID_MAX_RESULTS");
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(maxResults));
  const q = params.get("q")?.trim();
  if (q) listUrl.searchParams.set("q", q.slice(0, 500));
  const pageToken = params.get("pageToken");
  if (pageToken) listUrl.searchParams.set("pageToken", pageToken.slice(0, 2048));

  const list = await googleGet<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(listUrl, accessToken);

  const messages = await Promise.all((list.messages || []).map(async (item) => {
    const detailUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(item.id));
    detailUrl.searchParams.set("format", "metadata");
    for (const header of ["Subject", "From", "To", "Date"]) {
      detailUrl.searchParams.append("metadataHeaders", header);
    }
    const detail = await googleGet<{
      id: string;
      threadId: string;
      snippet?: string;
      internalDate?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    }>(detailUrl, accessToken);
    const headers = Object.fromEntries((detail.payload?.headers || []).map((header) => [
      header.name.toLowerCase(), header.value
    ]));
    return {
      id: detail.id,
      threadId: detail.threadId,
      snippet: detail.snippet || "",
      date: headers.date || null,
      from: headers.from || null,
      to: headers.to || null,
      subject: headers.subject || "(sans objet)",
      internalDate: detail.internalDate || null
    };
  }));

  return {
    messages,
    nextPageToken: list.nextPageToken || null,
    resultSizeEstimate: list.resultSizeEstimate ?? messages.length
  };
}

async function listDrive(accessToken: string, params: URLSearchParams) {
  const pageSize = boundedInteger(params.get("pageSize"), 20, 1, 50);
  if (pageSize === null) throw new Error("INVALID_PAGE_SIZE");
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size)");
  url.searchParams.set("q", params.get("q")?.trim().slice(0, 500) || "trashed = false");
  const pageToken = params.get("pageToken");
  if (pageToken) url.searchParams.set("pageToken", pageToken.slice(0, 2048));
  return googleGet<{ files?: unknown[]; nextPageToken?: string }>(url, accessToken);
}

async function listCalendar(accessToken: string, params: URLSearchParams) {
  const maxResults = boundedInteger(params.get("maxResults"), 25, 1, 50);
  if (maxResults === null) throw new Error("INVALID_MAX_RESULTS");
  const now = new Date();
  const timeMin = params.get("timeMin") || now.toISOString();
  const timeMax = params.get("timeMax") || new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const start = new Date(timeMin);
  const end = new Date(timeMax);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("INVALID_DATE_RANGE");
  }
  if (end.getTime() - start.getTime() > 90 * 86_400_000) {
    throw new Error("DATE_RANGE_TOO_LARGE");
  }
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", start.toISOString());
  url.searchParams.set("timeMax", end.toISOString());
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const pageToken = params.get("pageToken");
  if (pageToken) url.searchParams.set("pageToken", pageToken.slice(0, 2048));
  const result = await googleGet<{
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      htmlLink?: string;
      status?: string;
      start?: { date?: string; dateTime?: string; timeZone?: string };
      end?: { date?: string; dateTime?: string; timeZone?: string };
      attendees?: Array<{ email?: string; responseStatus?: string }>;
    }>;
    nextPageToken?: string;
    timeZone?: string;
  }>(url, accessToken);
  return {
    events: (result.items || []).map((event) => ({
      id: event.id,
      summary: event.summary || "(sans titre)",
      description: event.description || null,
      location: event.location || null,
      url: event.htmlLink || null,
      status: event.status || null,
      start: event.start || null,
      end: event.end || null,
      attendees: (event.attendees || []).map((attendee) => ({
        email: attendee.email || null,
        responseStatus: attendee.responseStatus || null
      }))
    })),
    nextPageToken: result.nextPageToken || null,
    timeZone: result.timeZone || null
  };
}

async function listContacts(accessToken: string, params: URLSearchParams) {
  const pageSize = boundedInteger(params.get("pageSize"), 50, 1, 100);
  if (pageSize === null) throw new Error("INVALID_PAGE_SIZE");
  const url = new URL("https://people.googleapis.com/v1/people/me/connections");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations");
  url.searchParams.set("sortOrder", "LAST_MODIFIED_DESCENDING");
  const pageToken = params.get("pageToken");
  if (pageToken) url.searchParams.set("pageToken", pageToken.slice(0, 2048));
  const result = await googleGet<{
    connections?: Array<{
      resourceName?: string;
      names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
      emailAddresses?: Array<{ value?: string; type?: string }>;
      phoneNumbers?: Array<{ value?: string; type?: string }>;
      organizations?: Array<{ name?: string; title?: string }>;
    }>;
    nextPageToken?: string;
    totalPeople?: number;
  }>(url, accessToken);
  return {
    contacts: (result.connections || []).map((person) => ({
      resourceName: person.resourceName || null,
      name: person.names?.[0]?.displayName || [person.names?.[0]?.givenName, person.names?.[0]?.familyName].filter(Boolean).join(" ") || null,
      emails: (person.emailAddresses || []).map((item) => ({ value: item.value || null, type: item.type || null })),
      phones: (person.phoneNumbers || []).map((item) => ({ value: item.value || null, type: item.type || null })),
      organizations: (person.organizations || []).map((item) => ({ name: item.name || null, title: item.title || null }))
    })),
    nextPageToken: result.nextPageToken || null,
    totalPeople: result.totalPeople ?? null
  };
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Authentification requise.", 401);

  const { service } = await context.params;
  if (!isGoogleService(service)) return jsonError("Service Google inconnu.", 404);

  try {
    const { accessToken } = await getGoogleAccessToken(session.user.id, service);
    const params = new URL(request.url).searchParams;
    let data: unknown;
    switch (service) {
      case "gmail":
        data = await listGmail(accessToken, params);
        break;
      case "drive":
        data = await listDrive(accessToken, params);
        break;
      case "calendar":
        data = await listCalendar(accessToken, params);
        break;
      case "contacts":
        data = await listContacts(accessToken, params);
        break;
    }
    return NextResponse.json({ ok: true, service, data }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "GOOGLE_SERVICE_NOT_CONNECTED") {
      return jsonError("Ce service Google n'est pas connecté à ton compte Zodi AI.", 409);
    }
    if (message.startsWith("INVALID_") || message === "DATE_RANGE_TOO_LARGE") {
      return jsonError("Les paramètres de recherche sont invalides ou trop larges.", 400);
    }
    if (message.startsWith("GOOGLE_API_401")) {
      return jsonError("L'accès Google a été révoqué ou a expiré. Reconnecte le service dans les paramètres.", 409);
    }
    console.error("Zodi AI Google service request failed:", {
      service,
      error: message.slice(0, 180)
    });
    return jsonError("Le service Google n'a pas pu répondre. Réessaie plus tard.", 502);
  }
}
