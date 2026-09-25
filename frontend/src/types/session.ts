/** The signed-in Algoverve user (not the broker account). */
export interface AppUser {
  id: number;
  email: string;
  name: string;
}

export interface SessionState {
  user: AppUser | null;
  /** "checking" = we haven't asked the server yet whether you're signed in */
  status: "checking" | "ready" | "submitting";
  error: string | null;
}
