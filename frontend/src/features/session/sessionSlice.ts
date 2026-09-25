import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import * as api from "../../services/api";
import type { AppUser, SessionState } from "../../types/session";

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** Ask the server "am I signed in?" when the app opens. */
export const loadSession = createAsyncThunk<
  AppUser | null,
  void,
  { rejectValue: string }
>("session/load", async (_, { rejectWithValue }) => {
  try {
    return await api.getMe();
  } catch (error) {
    return rejectWithValue(message(error, "Couldn’t reach Algoverve"));
  }
});

export const signIn = createAsyncThunk<
  AppUser,
  { email: string; password: string },
  { rejectValue: string }
>("session/signIn", async ({ email, password }, { rejectWithValue }) => {
  try {
    return await api.signIn(email, password);
  } catch (error) {
    return rejectWithValue(message(error, "Couldn’t sign in"));
  }
});

export const signUp = createAsyncThunk<
  AppUser,
  { name: string; email: string; password: string },
  { rejectValue: string }
>("session/signUp", async ({ name, email, password }, { rejectWithValue }) => {
  try {
    return await api.signUp(name, email, password);
  } catch (error) {
    return rejectWithValue(message(error, "Couldn’t create your account"));
  }
});

export const signOut = createAsyncThunk<void, void, { rejectValue: string }>(
  "session/signOut",
  async (_, { rejectWithValue }) => {
    try {
      await api.signOut();
    } catch (error) {
      return rejectWithValue(message(error, "Couldn’t sign out"));
    }
  },
);

const initialState: SessionState = {
  user: null,
  status: "checking",
  error: null,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    /** Server said 401 somewhere else: your login cookie expired. */
    sessionExpired(state) {
      state.user = null;
      state.status = "ready";
      state.error = "Your session ended. Sign in again.";
    },
    clearSessionError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "ready";
      })
      .addCase(loadSession.rejected, (state, action) => {
        state.user = null;
        state.status = "ready";
        state.error = action.payload ?? "Couldn’t reach Algoverve";
      })

      .addCase(signIn.pending, (state) => {
        state.status = "submitting";
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "ready";
      })
      .addCase(signIn.rejected, (state, action) => {
        state.status = "ready";
        state.error = action.payload ?? "Couldn’t sign in";
      })

      .addCase(signUp.pending, (state) => {
        state.status = "submitting";
        state.error = null;
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "ready";
      })
      .addCase(signUp.rejected, (state, action) => {
        state.status = "ready";
        state.error = action.payload ?? "Couldn’t create your account";
      })

      .addCase(signOut.fulfilled, (state) => {
        state.user = null;
        state.status = "ready";
        state.error = null;
      });
  },
});

export const { sessionExpired, clearSessionError } = sessionSlice.actions;

export default sessionSlice.reducer;
