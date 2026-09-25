import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import { getUserProfile, logoutUpstox } from "../../services/api";

import type { AuthState, UpstoxProfileResponse } from "../../types/auth";

/**
 * Fetch profile from FastAPI.
 *
 * React → /user/profile → Neon → Upstox access token → Upstox API → profile
 */
export const fetchUserProfile = createAsyncThunk<
  UpstoxProfileResponse,
  void,
  {
    rejectValue: string;
  }
>(
  "auth/fetchUserProfile",

  async (_, { rejectWithValue }) => {
    try {
      const response = await getUserProfile();

      return response as UpstoxProfileResponse;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Unable to fetch Upstox profile",
      );
    }
  },
);

/**
 * Disconnect Upstox.
 *
 * React → DELETE /logout → FastAPI revokes Upstox session + deletes tokens
 */
export const logoutUser = createAsyncThunk<
  void,
  void,
  {
    rejectValue: string;
  }
>(
  "auth/logoutUser",

  async (_, { rejectWithValue }) => {
    try {
      await logoutUpstox();
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Couldn’t disconnect Upstox",
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

const authSlice = createSlice({
  name: "auth",

  initialState,

  reducers: {
    clearAuth(state) {
      state.profile = null;

      state.status = "idle";

      state.error = null;

      state.isAuthenticated = false;
    },
  },

  extraReducers: (builder) => {
    builder

      /**
       * Request started
       */
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = "loading";

        state.error = null;
      })

      /**
       * Profile successfully received
       */
      .addCase(
        fetchUserProfile.fulfilled,
        (state, action: PayloadAction<UpstoxProfileResponse>) => {
          state.status = "succeeded";

          state.profile = action.payload;

          state.isAuthenticated = true;

          state.error = null;
        },
      )

      /**
       * Request failed
       */
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.status = "failed";

        state.isAuthenticated = false;

        state.error = action.payload ?? "Unable to connect to Upstox";
      })

      /**
       * Logout succeeded — reset auth state
       */
      .addCase(logoutUser.fulfilled, (state) => {
        state.profile = null;

        state.status = "idle";

        state.error = null;

        state.isAuthenticated = false;
      });
  },
});

export const { clearAuth } = authSlice.actions;

export default authSlice.reducer;