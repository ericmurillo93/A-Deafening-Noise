let capture;
export function reportRenderError(error) { capture?.(error); }

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || import.meta.env.DEV) return;
  const Sentry = await import("@sentry/react");
  capture = Sentry.captureException;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) delete event.request.cookies;
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}
