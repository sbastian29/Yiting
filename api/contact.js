/* ===================================================================
   api/contact.js — endpoint del formulario de contacto
   -------------------------------------------------------------------
   Sustituye a Formspree. Recibe el POST de <ContactForm/> (contact.jsx)
   y manda DOS correos vía Resend:

     1) el aviso a Yi-Ting, con Reply-To del visitante
     2) el acuse de recibo al visitante, en su idioma

   Runtime Node de Vercel — CommonJS a propósito: el repo no tiene
   package.json, así que `.js` en api/ se interpreta como CJS. `fetch`
   es global desde Node 18, por eso no hace falta ninguna dependencia.

   Variables de entorno (panel de Vercel → Settings → Environment Variables):
     RESEND_API_KEY  (obligatoria)  re_...
     MAIL_TO         (opcional)     destino del aviso
     MAIL_FROM       (opcional)     remitente verificado en Resend
   =================================================================== */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/* Destino por defecto: el correo público del portfolio. */
const MAIL_TO = process.env.MAIL_TO || 'lisayitingyang@gmail.com';

/* Remitente. `onboarding@resend.dev` es el remitente de pruebas que Resend
   da sin verificar dominio — PERO solo entrega a la dirección dueña de la
   cuenta, así que el acuse de recibo al visitante no saldrá hasta que se
   verifique lisayangtang.com y se ponga MAIL_FROM. */
const MAIL_FROM = process.env.MAIL_FROM || 'Portfolio <onboarding@resend.dev>';

/* Límites de tamaño — cortan payloads absurdos antes de tocar la API. */
const LIMITS = { name: 120, email: 200, subject: 200, message: 5000 };

/* Rate limit en memoria. El estado vive en la instancia lambda, así que no
   es una barrera dura (Vercel puede levantar varias) — basta para frenar el
   bot que reenvía el mismo formulario cien veces seguidas. */
const RATE = new Map();
const RATE_WINDOW = 60 * 1000;  // ventana de 1 minuto
const RATE_MAX    = 5;          // envíos por IP y ventana

function rateLimited(ip) {
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  hits.push(now);
  RATE.set(ip, hits);
  // Purga perezosa: sin esto el Map crece sin techo mientras viva la instancia.
  if (RATE.size > 500) {
    for (const [k, v] of RATE) if (!v.some(t => now - t < RATE_WINDOW)) RATE.delete(k);
  }
  return hits.length > RATE_MAX;
}

/* Escapado mínimo: todo lo que escribe el visitante se interpola en HTML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Saltos de línea → <br>, para que el mensaje conserve sus párrafos. */
function nl2br(s) { return esc(s).replace(/\r?\n/g, '<br>'); }

/* Cualquier cosa que se meta en una cabecera (Subject, Reply-To) tiene que
   ir sin CR/LF, o se puede inyectar una cabecera extra. */
function header(s) { return String(s || '').replace(/[\r\n]+/g, ' ').trim(); }

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

/* --- copy del acuse de recibo, en los tres idiomas del formulario --- */
const REPLY_COPY = {
  es: {
    subject: 'Gracias por escribir — Yi-Ting Yang Tang',
    hi: (n) => `Hola ${n},`,
    body: 'He recibido tu mensaje y te responderé personalmente en menos de 24 horas.',
    recap: 'Esto es lo que me enviaste:',
    fieldSubject: 'Asunto',
    fieldMessage: 'Mensaje',
    outro: 'Mientras tanto, puedes ver más trabajo aquí:',
    sign: 'Yi-Ting Yang Tang · 3D Modeling &amp; Texturing Artist · Madrid',
    auto: 'Este es un mensaje automático — puedes responder directamente a este correo.',
  },
  en: {
    subject: 'Thanks for reaching out — Yi-Ting Yang Tang',
    hi: (n) => `Hi ${n},`,
    body: 'I received your message and will get back to you personally within 24 hours.',
    recap: 'Here is what you sent me:',
    fieldSubject: 'Subject',
    fieldMessage: 'Message',
    outro: 'In the meantime, you can see more work here:',
    sign: 'Yi-Ting Yang Tang · 3D Modeling &amp; Texturing Artist · Madrid',
    auto: 'This is an automated message — you can reply directly to this email.',
  },
  zh: {
    subject: '感谢你的来信 — Yi-Ting Yang Tang',
    hi: (n) => `你好 ${n}：`,
    body: '我已收到你的留言，会在 24 小时内亲自回复你。',
    recap: '以下是你发送的内容：',
    fieldSubject: '主题',
    fieldMessage: '留言',
    outro: '在此期间，你可以在这里看到更多作品：',
    sign: 'Yi-Ting Yang Tang · 3D 建模与材质艺术家 · 马德里',
    auto: '这是一封自动回复邮件——你可以直接回复此邮件。',
  },
};

const LINKS = [
  ['Portfolio',   'https://lisayangtang.com/'],
  ['ArtStation',  'https://www.artstation.com/yinix'],
  ['LinkedIn',    'https://www.linkedin.com/in/yi-ting-yang-tang-b7ab43278/'],
];

/* Envoltorio común de los dos correos: fondo oscuro y tipografía del sitio,
   con serif de sistema como respaldo porque los clientes de correo no cargan
   webfonts. */
function shell(inner) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0b0c10;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0c10;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121319;border:1px solid #24262f;border-radius:14px;">
        <tr><td style="padding:32px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#d7d8de;">
          ${inner}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* Correo 1 — el aviso a Yi-Ting. */
function notifyHtml({ name, email, subject, message, lang }) {
  const row = (k, v) => `<tr>
    <td style="padding:6px 12px 6px 0;color:#7b7e8c;font-size:12px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${k}</td>
    <td style="padding:6px 0;color:#e8e9ee;">${v}</td></tr>`;
  return shell(`
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#fbbf7a;">Nuevo mensaje · lisayangtang.com</p>
    <h1 style="margin:0 0 24px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:400;color:#fff;">${esc(subject)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
      ${row('Nombre', esc(name))}
      ${row('Email', `<a href="mailto:${esc(email)}" style="color:#fbbf7a;text-decoration:none;">${esc(email)}</a>`)}
      ${row('Idioma', esc(lang))}
    </table>
    <div style="margin:24px 0 0;padding:18px 20px;background:#0e0f14;border-left:2px solid #fbbf7a;border-radius:0 8px 8px 0;color:#d7d8de;">
      ${nl2br(message)}
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#6d707d;">Responde a este correo y le llegará directamente a ${esc(name)}.</p>
  `);
}

/* Correo 2 — el acuse de recibo al visitante. */
function replyHtml({ name, subject, message, copy }) {
  const links = LINKS
    .map(([l, u]) => `<a href="${u}" style="color:#fbbf7a;text-decoration:none;">${l}</a>`)
    .join('<span style="color:#3a3d48;"> · </span>');
  return shell(`
    <h1 style="margin:0 0 20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:400;color:#fff;">${copy.hi(esc(name))}</h1>
    <p style="margin:0 0 24px;">${copy.body}</p>
    <p style="margin:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7b7e8c;">${copy.recap}</p>
    <div style="padding:18px 20px;background:#0e0f14;border:1px solid #24262f;border-radius:8px;">
      <p style="margin:0 0 12px;font-size:13px;color:#9a9dab;">${copy.fieldSubject}: <span style="color:#e8e9ee;">${esc(subject)}</span></p>
      <p style="margin:0;font-size:13px;color:#9a9dab;">${copy.fieldMessage}:</p>
      <p style="margin:6px 0 0;color:#d7d8de;">${nl2br(message)}</p>
    </div>
    <p style="margin:28px 0 8px;">${copy.outro}</p>
    <p style="margin:0 0 28px;">${links}</p>
    <hr style="border:0;border-top:1px solid #24262f;margin:0 0 16px;">
    <p style="margin:0 0 6px;font-size:13px;color:#9a9dab;">${copy.sign}</p>
    <p style="margin:0;font-size:11px;color:#5f626e;">${copy.auto}</p>
  `);
}

/* Versión en texto plano — no todos los clientes pintan HTML, y su ausencia
   sube la puntuación de spam. */
function plain(lines) { return lines.filter(Boolean).join('\n'); }

async function send(payload) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${detail.slice(0, 400)}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[contact] falta RESEND_API_KEY en las variables de entorno');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const ip = header(req.headers['x-forwarded-for']).split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  // El runtime de Vercel ya parsea el JSON, pero puede llegar como string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'bad_request' });
  }

  // Honeypot: campo invisible que solo rellenan los bots. Se responde 200
  // para que el bot lo dé por bueno y no reintente con otra estrategia.
  if (String(body.company || '').trim()) {
    return res.status(200).json({ ok: true });
  }

  const name    = String(body.name    || '').trim().slice(0, LIMITS.name);
  const email   = String(body.email   || '').trim().slice(0, LIMITS.email);
  const subject = String(body.subject || '').trim().slice(0, LIMITS.subject);
  const message = String(body.message || '').trim().slice(0, LIMITS.message);
  const lang    = ['es', 'en', 'zh'].includes(body.lang) ? body.lang : 'es';

  // Se revalida en servidor: la validación de contact.jsx es solo de UX.
  const errors = [];
  if (!name)           errors.push({ field: 'name',    message: 'El nombre es obligatorio' });
  if (!email)          errors.push({ field: 'email',   message: 'El email es obligatorio' });
  else if (!isEmail(email)) errors.push({ field: 'email', message: 'Email no válido' });
  if (!message)        errors.push({ field: 'message', message: 'El mensaje es obligatorio' });
  if (errors.length) return res.status(422).json({ errors });

  const copy      = REPLY_COPY[lang];
  const subjLine  = subject || { es: 'Sin asunto', en: 'No subject', zh: '无主题' }[lang];

  try {
    // El aviso a Yi-Ting es el que no puede fallar: se envía primero y en
    // solitario, para poder distinguirlo del acuse de recibo (que sí puede
    // caerse si el dominio aún no está verificado).
    await send({
      from: MAIL_FROM,
      to: [MAIL_TO],
      reply_to: header(`${name} <${email}>`),
      subject: header(`Portfolio — ${subjLine} — ${name}`),
      html: notifyHtml({ name, email, subject: subjLine, message, lang }),
      text: plain([
        `Nuevo mensaje desde lisayangtang.com`, '',
        `Nombre:  ${name}`,
        `Email:   ${email}`,
        `Asunto:  ${subjLine}`,
        `Idioma:  ${lang}`, '',
        message,
      ]),
    });
  } catch (err) {
    console.error('[contact] fallo enviando el aviso:', err.message);
    return res.status(502).json({ error: 'send_failed' });
  }

  // El acuse de recibo es best-effort: si falla, el mensaje ya llegó a
  // Yi-Ting, así que el visitante no debe ver un error.
  try {
    await send({
      from: MAIL_FROM,
      to: [email],
      reply_to: MAIL_TO,
      subject: header(copy.subject),
      html: replyHtml({ name, subject: subjLine, message, copy }),
      text: plain([
        copy.hi(name), '',
        copy.body, '', copy.recap, '',
        `${copy.fieldSubject}: ${subjLine}`,
        `${copy.fieldMessage}: ${message}`, '',
        copy.outro,
        ...LINKS.map(([l, u]) => `${l}: ${u}`), '',
        copy.sign.replace(/&amp;/g, '&'),
      ]),
    });
  } catch (err) {
    console.error('[contact] acuse de recibo no entregado:', err.message);
  }

  return res.status(200).json({ ok: true });
};
