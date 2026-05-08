import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../layouts/app-shell";
import { LoginPage } from "../pages/login-page";
import { RegisterPage } from "../pages/register-page";
import { InvitePage } from "../pages/invite-page";
import { DashboardPage } from "../pages/dashboard-page";
import { MenuPage } from "../pages/menu-page";
import { GeneratePage } from "../pages/generate-page";
import { IngredientsPage } from "../pages/ingredients-page";
import { RecipesPage } from "../pages/recipes-page";
import { ShoppingPage } from "../pages/shopping-page";
import { AnalyticsPage } from "../pages/analytics-page";
import { SettingsPage } from "../pages/settings-page";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/invite/:token", element: <InvitePage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "menu", element: <MenuPage /> },
      { path: "menu/generate", element: <GeneratePage /> },
      { path: "ingredients", element: <IngredientsPage /> },
      { path: "recipes", element: <RecipesPage /> },
      { path: "shopping", element: <ShoppingPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "family", element: <Navigate to="/settings?tab=family" replace /> },
      { path: "account", element: <Navigate to="/settings?tab=account" replace /> }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);
