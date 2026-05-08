import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider, getInitialTheme } from "./lib/theme";
import { router } from "./routes/router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 }
  }
});

if (typeof document !== "undefined") {
  const initialTheme = getInitialTheme();
  if (initialTheme !== "mercato-fresco") {
    document.documentElement.setAttribute("data-theme", initialTheme);
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
