import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PageErrorBoundary from "./components/PageErrorBoundary.jsx";
import { DialogGuardProvider } from "./components/DialogGuard.jsx";
import { I18nProvider } from "./lib/i18n.jsx";
import { initMonitoring } from "./lib/monitoring.js";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "./index.css";

void initMonitoring();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider><PageErrorBoundary><DialogGuardProvider><App /></DialogGuardProvider></PageErrorBoundary></I18nProvider>
  </React.StrictMode>
);
