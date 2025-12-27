import { getEvaDataMode, getEvaAnalysisMode, getLocalAnalysisBaseUrl, getCloudAnalysisBaseUrl } from '@/lib/config/evaAnalysisConfig';
import type {
  CreateInvitationResponse,
  Invitation,
  InvitationsResponse,
  ProfileWithSummaries,
  ProgressSummaryResponse,
} from '@/types/hgi';

function getEva2BaseUrl(): string | null {
  const mode = getEvaAnalysisMode();
  if (mode === 'none') return null;
  const base = mode === 'local' ? getLocalAnalysisBaseUrl() : getCloudAnalysisBaseUrl();
  return base ? base.replace(/\/$/, '') : null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const dataMode = getEvaDataMode();
  if (dataMode !== 'api') {
    throw new Error('backend_unavailable');
  }

  const baseUrl = getEva2BaseUrl();
  if (!baseUrl) {
    throw new Error('backend_unavailable');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: init?.body,
  });

  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }

  return (await res.json()) as T;
}

export async function fetchProfile(): Promise<ProfileWithSummaries> {
  return fetchJson<ProfileWithSummaries>('/me');
}

export async function fetchProgress(): Promise<ProgressSummaryResponse> {
  return fetchJson<ProgressSummaryResponse>('/me/progress');
}

export async function fetchInvitations(): Promise<InvitationsResponse> {
  return fetchJson<InvitationsResponse>('/me/invitations');
}

export async function createInvitation(email: string): Promise<Invitation> {
  const res = await fetchJson<CreateInvitationResponse>('/invitations', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

  return res.invitation;
}
