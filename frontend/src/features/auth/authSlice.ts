import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import { ApiError, getUserProfile, logoutUpstox } from "../../services/api";
import { sessionExpired, signOut } from "../session/sessionSlice";

import type { AuthState, UpstoxProfileResponse } from "../../types/auth";

/**
 * Fetch the signed-in user's Upstox profile.
 *
 * React → /brokers/upstox/profile → (session cookie → user) → Neon → token → Upstox
 *
 * Resolves to null when Upstox isn't connected yet (that's not an error).
 */
export const fetchUserProfile = createAsyncThunk<
  UpstoxProfileResponse | null,
  void,
  { rejectValue: string }
>("auth/fetchUserProfile", async (_, { dispatch, rejectWithValue }) => {
  try {
    return await getUserProfile();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      dispatch(sessionExpired());
    }
    return rejectWithValue(
      error instanceof Error ? error.message : "Unable to fetch Upstox profile",
    );
  }
});

/**
 * Disconnect Upstox.
 *
 * React → DELETE /brokers/upstox → FastAPI revokes Upstox session + deletes token
 */
export const logoutUser = createAsyncThunk<void, void, { rejectValue: string }>(
  "auth/logoutUser",
  async (_, { rejectWithValue }) => {
    try {
      await logoutUpstox();
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Couldn’t disconnect Upstox",
      );
    }
  },
);

const initialState: AuthState = {
  profile: null,
  status: "idle",
  error: null,
  isAuthenticated: false,
};

const reset = (state: AuthState) => {
  state.profile = null;
  state.status = "idle";
  state.error = null;
  state.isAuthenticated = false;
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuth: reset,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(
        fetchUserProfile.fulfilled,
        (state, action: PayloadAction<UpstoxProfileResponse | null>) => {
          state.status = "succeeded";
          state.profile = action.payload;
          state.isAuthenticated = action.payload !== null;
          state.error = null;
        },
      )
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.status = "failed";
        state.isAuthenticated = false;
        state.error = action.payload ?? "Unable to connect to Upstox";
      })

      /** Upstox disconnected */
      .addCase(logoutUser.fulfilled, reset)

      /** Signed out of Algoverve: forget broker data too */
      .addCase(signOut.fulfilled, reset)
      .addCase(sessionExpired, reset);
  },
});

export const { clearAuth } = authSlice.actions;

export default authSlice.reducer;