import { configureStore } from "@reduxjs/toolkit";

import authReducer from "../features/auth/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

/**
 * RootState represents the entire Redux state.
 */
export type RootState = ReturnType<typeof store.getState>;

/**
 * AppDispatch represents our Redux dispatch function.
 */
export type AppDispatch = typeof store.dispatch;
