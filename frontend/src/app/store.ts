import { configureStore } from "@reduxjs/toolkit";

import authReducer from "../features/auth/authSlice";
import sessionReducer from "../features/session/sessionSlice";

export const store = configureStore({
  reducer: {
    session: sessionReducer, // who you are in Algoverve
    auth: authReducer, // your Upstox connection
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
