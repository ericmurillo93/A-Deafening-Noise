import React from "react";
import { useI18n } from "../lib/i18n.jsx";
import { reportRenderError } from "../lib/monitoring.js";

class RecoveryBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("Page could not render", error); reportRenderError(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    const { t } = this.props;
    return <section role="alert" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-lg font-bold text-zinc-100">{t("This page could not open.")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("Your saved concerts are safe. Reload to try again.")}</p>
      <button type="button" className="adn-button-primary mt-4" onClick={() => window.location.reload()}>{t("Reload page")}</button>
    </section>;
  }
}

export default function PageErrorBoundary({ children, resetKey }) {
  const { t } = useI18n();
  return <RecoveryBoundary key={resetKey} t={t}>{children}</RecoveryBoundary>;
}
