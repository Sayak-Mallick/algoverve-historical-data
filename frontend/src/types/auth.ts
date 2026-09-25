export interface UpstoxProfile {
  email: string;
  exchanges: string[];
  products: string[];
  broker: string;
  user_id: string;
  user_name: string;
  order_types: string[];
  user_type: string;
  poa: boolean | null;
  ddpi: boolean;
  is_active: boolean;
}

export interface UpstoxProfileResponse {
  status: "success" | "error";
  data: UpstoxProfile;
}

/** Broker (Upstox) connection state for the signed-in user. */
export interface AuthState {
  profile: UpstoxProfileResponse | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  isAuthenticated: boolean;
}
