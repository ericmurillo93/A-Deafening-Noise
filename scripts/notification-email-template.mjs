const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const COPY = {
  friend_request: (item) => [`${item.actorName} sent you a friend request`, "Open Friends to respond."],
  friend_request_accepted: (item) => [`${item.actorName} accepted your friend request`, "You can now invite each other to concerts."],
  friend_request_declined: (item) => [`${item.actorName} declined your friend request`, "No action is needed."],
  concert_invitation: (item) => [`${item.actorName} invited you to a concert`, [item.artist, item.venue, item.date].filter(Boolean).join(" · ")],
  invitation_accepted: (item) => [`${item.actorName} confirmed attendance`, [item.artist, item.date].filter(Boolean).join(" · ")],
  invitation_declined: (item) => [`${item.actorName} declined the invitation`, [item.artist, item.date].filter(Boolean).join(" · ")],
  concert_changed: (item) => [`${item.artist || "A concert"} was updated`, [item.venue, item.date].filter(Boolean).join(" · ")],
  ticket_available: (item) => [`Tickets are now available for ${item.artist}`, item.date],
  ticket_link_changed: (item) => [`The ticket link changed for ${item.artist}`, item.date],
  selling_fast: (item) => [`${item.artist} is selling fast`, item.date],
  spotify_reconnect: () => ["Reconnect Spotify", "Your listening profile needs attention to keep discovery current."],
};

export function renderNotificationEmail(item) {
  const [title, detail] = (COPY[item.kind] || (() => ["New activity", "Open A Deafening Noise to review it."]))(item);
  const path = item.kind.startsWith("friend_") || item.kind === "concert_invitation" ? "/friends" : item.kind === "spotify_reconnect" ? "/profile" : "/activity";
  const subject = title;
  const html = `<!doctype html><html><body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:600px"><tr><td style="padding-bottom:22px;font-size:18px;font-weight:900;text-transform:uppercase">A Deafening Noise<div style="margin-top:5px;color:#71717a;font-size:10px;letter-spacing:1.8px">ACTIVITY</div></td></tr><tr><td style="padding:28px 24px;border:1px solid #30343a;border-radius:8px;background:#15191e"><div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">New update</div><h1 style="margin:10px 0;color:#f4f4f5;font-size:28px;line-height:1.1">${escapeHtml(title)}</h1><p style="margin:0;color:#a1a1aa;font-size:14px;line-height:1.6">${escapeHtml(detail)}</p><a href="https://adeafeningnoise.com${path}" style="display:inline-block;margin-top:22px;border-radius:8px;background:#2563eb;color:white;padding:13px 20px;font-size:12px;font-weight:800;text-decoration:none;text-transform:uppercase">Open A Deafening Noise&nbsp; →</a></td></tr><tr><td style="padding-top:22px;text-align:center;font-size:11px;color:#71717a"><a href="https://adeafeningnoise.com/profile" style="color:#a1a1aa">Manage notification preferences</a></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text: `A Deafening Noise\n\n${title}\n${detail}\n\nhttps://adeafeningnoise.com${path}` };
}
