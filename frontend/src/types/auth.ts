export interface UpstoxProfile {
  email: string;
  exchanges: string[];
  products: string[];

  [key: string]: unknown;
}

export interface UpstoxProfileResponse {
  status?: string;
  data?: UpstoxProfile;
  email?: string;
  exchanges?: string[];
  products?: string[];
  [key: string]: unknown;
}

export interface AuthState {
  profile: UpstoxProfileResponse | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  isAuthenticated: boolean;
}