const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const COPY={
  friend_request:i=>[`${i.actorName} sent you a friend request`,'Open Friends to respond.'],
  friend_request_accepted:i=>[`${i.actorName} accepted your friend request`,'You can now invite each other to concerts.'],
  friend_request_declined:i=>[`${i.actorName} declined your friend request`,'No action is needed.'],
  concert_invitation:i=>[`${i.actorName} invited you to a concert`,[i.artist,i.venue,i.date].filter(Boolean).join(' · ')],
  invitation_accepted:i=>[`${i.actorName} confirmed attendance`,[i.artist,i.date].filter(Boolean).join(' · ')],
  invitation_declined:i=>[`${i.actorName} declined the invitation`,[i.artist,i.date].filter(Boolean).join(' · ')],
  concert_changed:i=>[`${i.artist||'A concert'} was updated`,[i.venue,i.date].filter(Boolean).join(' · ')],
  ticket_available:i=>[`Tickets are now available for ${i.artist}`,i.date],
  ticket_link_changed:i=>[`The ticket link changed for ${i.artist}`,i.date],
  selling_fast:i=>[`${i.artist} is selling fast`,i.date],
  spotify_reconnect:()=>['Reconnect Spotify','Your listening profile needs attention to keep discovery current.'],
};
const SPANISH={
  friend_request:i=>[`${i.actorName} te ha enviado una solicitud de amistad`,'Abre Amigos para responder.'],
  friend_request_accepted:i=>[`${i.actorName} ha aceptado tu solicitud de amistad`,'Ya podéis invitaros a conciertos.'],
  friend_request_declined:i=>[`${i.actorName} ha rechazado tu solicitud de amistad`,'No necesitas hacer nada.'],
  concert_invitation:i=>[`${i.actorName} te ha invitado a un concierto`,[i.artist,i.venue,i.date].filter(Boolean).join(' · ')],
  invitation_accepted:i=>[`${i.actorName} ha confirmado su asistencia`,[i.artist,i.date].filter(Boolean).join(' · ')],
  invitation_declined:i=>[`${i.actorName} ha rechazado la invitación`,[i.artist,i.date].filter(Boolean).join(' · ')],
  concert_changed:i=>[`${i.artist||'Un concierto'} se ha actualizado`,[i.venue,i.date].filter(Boolean).join(' · ')],
  ticket_available:i=>[`Ya hay entradas para ${i.artist}`,i.date],
  ticket_link_changed:i=>[`Ha cambiado el enlace de entradas de ${i.artist}`,i.date],
  selling_fast:i=>[`Las entradas de ${i.artist} se están agotando`,i.date],
  spotify_reconnect:()=>['Vuelve a conectar Spotify','Actualiza tu conexión para seguir recibiendo sugerencias personalizadas.'],
};
export const notificationEmailTypes=Object.keys(COPY);
export function renderNotificationEmail(item) {
  const es=item.language==='es';
  const [subject,detail]=((es?SPANISH:COPY)[item.kind]||(()=>[es?'Nueva actividad':'New activity','']))(item);
  const path=item.kind.startsWith('friend_')||item.kind==='concert_invitation'?'/friends':item.kind==='spotify_reconnect'?'/profile':'/activity';
  const action=es?'Abrir A Deafening Noise':'Open A Deafening Noise';
  const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:600px"><tr><td style="padding-bottom:22px;font-size:18px;font-weight:900;text-transform:uppercase">A Deafening Noise<div style="margin-top:5px;color:#71717a;font-size:10px;letter-spacing:1.8px">${es ? "ACTIVIDAD" : "ACTIVITY"}</div></td></tr><tr><td style="padding:28px 24px;border:1px solid #30343a;border-radius:8px;background:#15191e"><div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">${es ? "Nueva actividad" : "New update"}</div><h1 style="margin:10px 0;color:#f4f4f5;font-size:28px;line-height:1.1">${escapeHtml(subject)}</h1><p style="margin:0;color:#a1a1aa;font-size:14px;line-height:1.6">${escapeHtml(detail)}</p><a href="https://adeafeningnoise.com${path}" style="display:inline-block;margin-top:22px;border-radius:8px;background:#2563eb;color:white;padding:13px 20px;font-size:12px;font-weight:800;text-decoration:none;text-transform:uppercase">${action}&nbsp; →</a></td></tr><tr><td style="padding-top:22px;text-align:center;font-size:11px;color:#71717a"><a href="https://adeafeningnoise.com/profile" style="color:#a1a1aa">${es ? "Gestionar preferencias de notificaciones" : "Manage notification preferences"}</a></td></tr></table></td></tr></table></body></html>`;
  return {subject,html,text:`A Deafening Noise\n\n${subject}\n${detail}\n\n${action}: https://adeafeningnoise.com${path}\n${es?'Gestionar preferencias de email':'Manage email preferences'}: https://adeafeningnoise.com/profile`};
}
