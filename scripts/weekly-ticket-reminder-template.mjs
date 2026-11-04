const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function ticketLink(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? escape(url.href) : ""; } catch { return ""; }
}

export function renderWeeklyTicketReminder(displayName, concerts, language = "en") {
  const es = language === "es";
  const subject = es ? "Tus conciertos pendientes de comprar" : "Your concerts with tickets still to buy";
  const intro = es ? "Estos conciertos están en tu calendario, pero todavía no has marcado las entradas como compradas." : "These concerts are in your calendar, but you haven’t marked their tickets as bought yet.";
  const buy = es ? "Ver entradas" : "View tickets";
  const open = es ? "Abrir calendario" : "Open calendar";
  const preferences = es ? "Gestionar preferencias de email" : "Manage email preferences";
  const cards = concerts.map((concert) => {
    const url = ticketLink(concert.ticketUrl);
    const country = /^[A-Z]{2}$/.test(concert.country || "") ? new Intl.DisplayNames([es ? "es" : "en"], { type: "region" }).of(concert.country) : concert.country;
    return `<tr><td style="padding-bottom:12px"><table role="presentation" width="100%" style="border:1px solid #30343a;border-radius:8px;background:#111418"><tr><td style="padding:18px"><p style="margin:0 0 8px;color:#60a5fa;font-size:12px;font-weight:700">${escape(concert.date)}</p><h2 style="margin:0;color:#f4f4f5;font-size:18px;line-height:1.3">${escape(concert.artist)}</h2><p style="margin:8px 0 0;color:#a1a1aa;font-size:13px;line-height:1.5">${[concert.venue, concert.city, country].filter(Boolean).map(escape).join(" · ")}</p>${url ? `<a href="${url}" style="display:inline-block;margin-top:12px;color:#60a5fa;font-size:13px;font-weight:700;text-decoration:none">${buy} →</a>` : ""}</td></tr></table></td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="${es ? "es" : "en"}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px"><tr><td style="padding:0 2px 24px;font-size:18px;font-weight:900;letter-spacing:.3px">A DEAFENING NOISE</td></tr><tr><td style="padding:24px;border:1px solid #30343a;border-radius:8px;background:#15191e"><p style="margin:0 0 10px;color:#60a5fa;font-size:12px;font-weight:700">${es ? "Tu recordatorio semanal" : "Your weekly reminder"}</p><h1 style="margin:0 0 14px;font-size:28px;line-height:1.15">${escape(subject)}</h1><p style="margin:0;color:#a1a1aa;font-size:14px;line-height:1.6">${es ? "Hola" : "Hi"} ${escape(displayName || (es ? "" : "there"))},<br>${intro}</p></td></tr><tr><td style="height:18px"></td></tr>${cards}<tr><td align="center" style="padding:14px 0 24px"><a href="https://adeafeningnoise.com/calendar" style="display:inline-block;border-radius:8px;background:#2563eb;color:#fff;padding:14px 22px;font-size:13px;font-weight:800;text-decoration:none">${open} →</a></td></tr><tr><td align="center" style="padding-top:20px;border-top:1px solid #27272a;font-size:12px"><a href="https://adeafeningnoise.com/profile" style="color:#a1a1aa">${preferences}</a></td></tr></table></td></tr></table></body></html>`;
  const text = `A Deafening Noise\n\n${subject}\n\n${intro}\n\n${concerts.map((concert) => `${concert.artist} — ${concert.date}\n${[concert.venue, concert.city].filter(Boolean).join(" · ")}${ticketLink(concert.ticketUrl) ? `\n${concert.ticketUrl}` : ""}`).join("\n\n")}\n\n${open}: https://adeafeningnoise.com/calendar\n${preferences}: https://adeafeningnoise.com/profile`;
  return { subject, html, text };
}

export function isReminderTime(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(({ type, value }) => [type, value]));
  return parts.weekday === "Mon" && Number(parts.hour) >= 8;
}
