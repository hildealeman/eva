export type HgiRole = 'ghost' | 'active';

export type HgiState = 'ok' | 'suspended' | 'banned';

export interface Profile {
  id: string;
  createdAt: string;
  updatedAt: string;
  role: HgiRole;
  state: HgiState;
  tevScore: number;
  dailyStreak: number;
  lastActiveAt: string | null;
  invitationsGrantedTotal: number;
  invitationsUsed: number;
  invitationsRemaining: number;
}

export interface ProgressVotesGiven {
  up: number;
  down: number;
}

export interface ProgressSummary {
  createdAt?: string;
  progressPercentToNextLevel: number;
  activityMinutes: number;
  shardsReviewed: number;
  shardsPublished: number;
  votesGiven: ProgressVotesGiven;
}

export interface InvitationsSummary {
  grantedTotal: number;
  used: number;
  remaining: number;
}

export type InvitationState = 'pending' | 'accepted' | 'expired' | 'revoked' | string;

export interface Invitation {
  id: string;
  email: string;
  state: InvitationState;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
}

export interface ProfileWithSummaries {
  profile: Profile;
  todayProgress: ProgressSummary | null;
  invitationsSummary: InvitationsSummary;
}

export interface ProgressSummaryResponse {
  today: ProgressSummary;
  history: ProgressSummary[];
}

export interface InvitationsResponse {
  invitations: Invitation[];
}

export interface CreateInvitationResponse {
  invitation: Invitation;
}
