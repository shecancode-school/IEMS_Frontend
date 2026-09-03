import { configureStore } from "@reduxjs/toolkit";
import authReducer, { type AuthState } from "./authSlice";

/* A fresh store per client instance (created in Providers) keeps App Router
   navigations from leaking state between requests during SSR.

   `preloadedState` is retained for tests that want to start from a known
   session; the app itself passes nothing, because both sessions live in
   httpOnly cookies and are restored by asking the server on mount. */
export function makeStore(preloadedState?: { auth: AuthState }) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState,
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
