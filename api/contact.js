/* ===================================================================
   api/contact.js — endpoint del formulario de contacto
   -------------------------------------------------------------------
   Sustituye a Formspree. Recibe el POST de <ContactForm/> (contact.jsx)
   y manda DOS correos por el SMTP de Gmail:

     1) el aviso a Yi-Ting, con Reply-To del visitante
     2) el acuse de recibo al visitante, en su idioma

   Se usa el SMTP de su propia cuenta —autenticando con una contraseña de
   aplicación— en vez de un servicio tipo Resend porque es la única forma
   gratuita de que el correo salga DESDE `lisayitingyang@gmail.com`. Los
   proveedores externos exigen un dominio verificado por DNS, y Gmail
   rechaza por DMARC cualquier correo que diga venir de @gmail.com sin
   salir de sus servidores.

   Runtime Node de Vercel — CommonJS a propósito: sin `"type":"module"` en
   package.json, los `.js` de api/ se interpretan como CJS.

   Variables de entorno (panel de Vercel → Settings → Environment Variables):
     GMAIL_USER          (obligatoria)  lisayitingyang@gmail.com
     GMAIL_APP_PASSWORD  (obligatoria)  contraseña de aplicación de 16 letras
     MAIL_TO             (opcional)     dónde llega el aviso
     REPLY_TO            (opcional)     a dónde contesta el visitante
     MAIL_FROM_NAME      (opcional)     nombre visible del remitente
   =================================================================== */

const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER || '';

/* Google enseña la contraseña de aplicación en cuatro bloques separados por
   espacios ("abcd efgh ijkl mnop") y casi todo el mundo la pega tal cual.
   El servidor SMTP no los admite, así que se limpian aquí. */
const GMAIL_PASS = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

/* Dónde llega el aviso. Por defecto, la propia cuenta que envía. */
const MAIL_TO = process.env.MAIL_TO || GMAIL_USER || 'lisayitingyang@gmail.com';

/* A dónde va la respuesta del visitante si le da a Responder. Separado de
   MAIL_TO a propósito: así el acuse de recibo apunta siempre al correo real
   de Yi-Ting aunque el aviso se esté desviando a un buzón de pruebas. */
const REPLY_TO = process.env.REPLY_TO || GMAIL_USER || 'lisayitingyang@gmail.com';

/* El remitente NO es configurable a dedo: Gmail solo deja enviar desde la
   cuenta autenticada (o uno de sus alias confirmados). Poner otra dirección
   haría que Gmail la reescribiera igualmente. Lo único que se elige es el
   nombre visible, que es lo que lee la gente en la bandeja. */
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Yi-Ting Yang Tang';

/* El transporte se crea una sola vez por instancia: Vercel reutiliza la
   lambda entre peticiones cercanas, así que la conexión TLS se aprovecha en
   vez de renegociarse en cada envío. */
let _transport = null;
function transport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,                 // TLS directo, sin STARTTLS
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      // Sin estos límites, un SMTP que no responde deja la función colgada
      // hasta que Vercel la mata, y el visitante se come la espera entera.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return _transport;
}

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

/* ===================================================================
   PLANTILLAS
   Paleta y estructura vienen del diseño EMAIL_FREELANCE. Todo va en
   `style=` inline y maquetado con <table>: Gmail elimina las hojas de
   estilo en varios contextos y Outlook usa el motor de Word, que ignora
   flex, grid y casi todo margin. Las webfonts tampoco cargan — de ahí
   Georgia / Arial / Courier New, que existen en todas partes.
   =================================================================== */

const C = {
  bg:'#060608', card:'#0d0d12', panel:'#13131a',
  line:'#1f1f2e', line2:'#2e2d3d', accent:'#c4b5fd',
  text:'#e8e6f0', body:'#b7b4c6', dim:'#5c5a6e', faint:'#403f52',
};
const F = {
  sans:  "Arial,Helvetica,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono:  "'Courier New',Courier,monospace",
};

const PORTFOLIO = 'https://lisayangtang.com/';
const LINKS = [
  ['ver portfolio', PORTFOLIO],
  ['artstation',    'https://www.artstation.com/yinix'],
  ['linkedin',      'https://www.linkedin.com/in/yi-ting-yang-tang-b7ab43278/'],
];

/* Envoltorio común: fondo, tarjeta de 600px, cabecera con el logotipo y la
   regla de acento. `preheader` es el texto que la bandeja enseña junto al
   asunto — oculto en el cuerpo, pero decide si abren el correo o no. */
function shell({ preheader, tag, inner }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(tag)}</title>
<!--[if mso]>
<style type="text/css">
  body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
<style type="text/css">
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse: collapse; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${C.accent}; }
  a:hover { color:#d9ccff !important; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:28px !important; padding-right:28px !important; }
    .display { font-size:40px !important; line-height:46px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.bg};">
  <span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">${esc(preheader)}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; background-color:${C.card};">

          <tr>
            <td class="px" style="padding:34px 48px 26px 48px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" valign="middle" style="font-family:${F.sans};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="border:1px solid ${C.line2}; padding:5px 8px; font-family:${F.sans}; font-size:13px; font-weight:bold; letter-spacing:0.06em; color:${C.text};">YT</td>
                        <td valign="middle" style="padding-left:12px; font-family:${F.sans}; font-size:17px; font-weight:bold; letter-spacing:0.14em; color:${C.text};">LISA</td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle" style="font-family:${F.mono}; font-size:11px; letter-spacing:0.14em; color:${C.dim}; text-transform:uppercase;">// ${esc(tag).replace(/ /g, '&nbsp;')}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:0 48px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td height="2" style="height:2px; background-color:${C.accent}; font-size:0; line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          ${inner}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* Bloque de título: numerito monoespaciado + display en serif itálica. */
function hero(eyebrow, title) {
  return `<tr>
    <td class="px" style="padding:48px 48px 8px 48px;">
      <div style="font-family:${F.mono}; font-size:11px; letter-spacing:0.24em; color:${C.dim}; text-transform:uppercase; margin-bottom:22px;">${esc(eyebrow)}</div>
      <h1 class="display" style="margin:0; font-family:${F.serif}; font-style:italic; font-weight:normal; font-size:52px; line-height:56px; letter-spacing:-0.01em; color:${C.text};">${esc(title)}</h1>
    </td>
  </tr>`;
}

/* Ficha de datos. `rows` = [{ label, value }] con `value` ya en HTML seguro;
   la numeración 01, 02, 03… se calcula sola. */
function card(eyebrow, rows) {
  const body = rows.map((r, i) => {
    const last = i === rows.length - 1;
    return `<tr>
      <td style="padding:18px 24px;${last ? '' : ` border-bottom:1px solid ${C.line};`}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="48" valign="top" style="font-family:${F.mono}; font-size:11px; letter-spacing:0.12em; color:${C.accent};">${String(i + 1).padStart(2, '0')}</td>
            <td valign="top">
              <div style="font-family:${F.mono}; font-size:10px; letter-spacing:0.2em; color:${C.dim}; text-transform:uppercase; margin-bottom:5px;">${esc(r.label)}</div>
              <div style="font-family:${F.sans}; font-weight:300; font-size:15px; line-height:24px; color:${C.text};">${r.value}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  return `<tr>
    <td class="px" style="padding:38px 48px 0 48px;">
      <div style="font-family:${F.mono}; font-size:11px; letter-spacing:0.24em; color:${C.dim}; text-transform:uppercase; margin-bottom:14px;">${esc(eyebrow)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.panel}; border:1px solid ${C.line};">
        ${body}
      </table>
    </td>
  </tr>`;
}

function rule(top) {
  return `<tr>
    <td class="px" style="padding:${top}px 48px 0 48px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td height="1" style="height:1px; background-color:${C.line}; font-size:0; line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>`;
}

function footer(note) {
  return `<tr>
    <td class="px" style="padding:46px 48px 40px 48px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td height="1" style="height:1px; background-color:${C.line}; font-size:0; line-height:0;">&nbsp;</td></tr>
      </table>
      <p style="margin:18px 0 0 0; font-family:${F.mono}; font-size:10px; line-height:18px; letter-spacing:0.1em; color:${C.faint}; text-transform:uppercase;">
        ${note}<br>Yi-Ting Yang Tang &nbsp;·&nbsp; Madrid, España
      </p>
    </td>
  </tr>`;
}

/* --- copy del acuse de recibo, en los tres idiomas del formulario --- */
const REPLY_COPY = {
  es: {
    subject: 'Mensaje recibido — Yi-Ting Yang Tang',
    tag: 'mensaje recibido',
    pre: 'He recibido tu mensaje. Gracias por escribirme — te respondo en menos de 24 horas.',
    eyebrow: '01 · confirmación',
    title: 'Mensaje recibido.',
    p1: 'Gracias por pensar en mí para tu proyecto. Me encanta que quieras contarme lo que tienes en mente — cada colaboración empieza con un mensaje como el tuyo.',
    p2a: 'Leo todo personalmente. Normalmente respondo en ',
    p2b: 'menos de 24 horas',
    p2c: '; si el proyecto encaja, te escribiré para seguir la conversación.',
    sumEyebrow: '02 · lo que enviaste',
    lName: 'Nombre', lSubject: 'Asunto', lMessage: 'Mensaje',
    bye: 'Hasta pronto —',
    role: 'Artista 3D · Freelance · Madrid',
    auto: 'Este es un mensaje automático de confirmación. No hace falta responder — te escribiré yo.',
  },
  en: {
    subject: 'Message received — Yi-Ting Yang Tang',
    tag: 'message received',
    pre: 'I got your message. Thanks for writing — I reply within 24 hours.',
    eyebrow: '01 · confirmation',
    title: 'Message received.',
    p1: 'Thank you for thinking of me for your project. I love hearing what people have in mind — every collaboration starts with a message like yours.',
    p2a: 'I read everything personally. I usually reply within ',
    p2b: '24 hours',
    p2c: '; if the project is a good fit, I will write back to keep the conversation going.',
    sumEyebrow: '02 · what you sent',
    lName: 'Name', lSubject: 'Subject', lMessage: 'Message',
    bye: 'Talk soon —',
    role: '3D Artist · Freelance · Madrid',
    auto: 'This is an automated confirmation. No need to reply — I will write to you.',
  },
  zh: {
    subject: '已收到你的留言 — Yi-Ting Yang Tang',
    tag: '已收到留言',
    pre: '我已收到你的留言。感谢来信——我会在 24 小时内回复。',
    eyebrow: '01 · 确认',
    title: '已收到你的留言。',
    p1: '感谢你想到我来参与你的项目。我很高兴听到你的想法——每一次合作都从这样一封留言开始。',
    p2a: '每一封我都会亲自阅读，通常会在 ',
    p2b: '24 小时内',
    p2c: ' 回复；如果项目合适，我会写信与你继续沟通。',
    sumEyebrow: '02 · 你发送的内容',
    lName: '姓名', lSubject: '主题', lMessage: '留言',
    bye: '期待与你联系 —',
    role: '3D 艺术家 · 自由职业 · 马德里',
    auto: '这是一封自动确认邮件。无需回复——我会主动联系你。',
  },
};

/* Correo 1 — el aviso a Yi-Ting. Solo en español: lo lee ella. */
function notifyHtml({ name, email, subject, message, lang }) {
  const langName = { es: 'Español', en: 'Inglés', zh: 'Chino' }[lang];
  return shell({
    preheader: `${name} — ${subject}`,
    tag: 'nuevo mensaje',
    inner:
      hero('01 · contacto', 'Nuevo mensaje.') +
      `<tr>
        <td class="px" style="padding:26px 48px 0 48px;">
          <p style="margin:0; font-family:${F.sans}; font-weight:300; font-size:16px; line-height:26px; color:${C.body};">
            Alguien ha escrito desde el formulario de <a href="${PORTFOLIO}" style="color:${C.accent}; text-decoration:none;">lisayangtang.com</a>. Puedes responder directamente a este correo: la respuesta le llegará a ${esc(name)}.
          </p>
        </td>
      </tr>` +
      card('02 · datos del contacto', [
        { label: 'Nombre',  value: esc(name) },
        { label: 'Email',   value: `<a href="mailto:${esc(email)}" style="color:${C.accent}; text-decoration:none;">${esc(email)}</a>` },
        { label: 'Asunto',  value: esc(subject) },
        { label: 'Idioma',  value: esc(langName) },
        { label: 'Mensaje', value: `<span style="color:${C.body};">${nl2br(message)}</span>` },
      ]) +
      footer('Aviso automático del formulario de contacto.'),
  });
}

/* Correo 2 — el acuse de recibo al visitante. */
function replyHtml({ name, subject, message, copy }) {
  const links = LINKS
    .map(([l, u]) => `<a href="${u}" style="font-family:${F.mono}; font-size:12px; letter-spacing:0.14em; color:${C.accent}; text-decoration:none;">›&nbsp;${l}</a>`)
    .join(`<span style="font-family:${F.mono}; font-size:12px; color:${C.line2};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);

  return shell({
    preheader: copy.pre,
    tag: copy.tag,
    inner:
      hero(copy.eyebrow, copy.title) +
      `<tr>
        <td class="px" style="padding:26px 48px 0 48px;">
          <p style="margin:0 0 18px 0; font-family:${F.sans}; font-weight:300; font-size:16px; line-height:26px; color:${C.body};">${copy.p1}</p>
          <p style="margin:0; font-family:${F.sans}; font-weight:300; font-size:16px; line-height:26px; color:${C.body};">${copy.p2a}<span style="color:${C.text};">${copy.p2b}</span>${copy.p2c}</p>
        </td>
      </tr>` +
      card(copy.sumEyebrow, [
        { label: copy.lName,    value: esc(name) },
        { label: copy.lSubject, value: esc(subject) },
        { label: copy.lMessage, value: `<span style="color:${C.body};">${nl2br(message)}</span>` },
      ]) +
      rule(44) +
      `<tr>
        <td class="px" style="padding:28px 48px 0 48px;">
          <p style="margin:0 0 20px 0; font-family:${F.serif}; font-style:italic; font-size:19px; line-height:28px; color:#c9c6d8;">${copy.bye}</p>
          <div style="font-family:${F.sans}; font-weight:bold; font-size:18px; letter-spacing:0.02em; color:${C.text};">Lisa · Yi-Ting Yang Tang</div>
          <div style="font-family:${F.mono}; font-size:11px; letter-spacing:0.16em; color:${C.dim}; text-transform:uppercase; margin:8px 0 18px 0;">${copy.role}</div>
          ${links}
        </td>
      </tr>` +
      footer(copy.auto),
  });
}

/* Versión en texto plano — no todos los clientes pintan HTML, y su ausencia
   sube la puntuación de spam. */
function plain(lines) { return lines.filter(Boolean).join('\n'); }

function send({ to, replyTo, subject, html, text }) {
  return transport().sendMail({
    from: { name: MAIL_FROM_NAME, address: GMAIL_USER },
    to,
    replyTo,
    subject,
    html,
    text,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!GMAIL_USER || !GMAIL_PASS) {
    // Se devuelve QUÉ variable falta, no su valor: sin esto el 500 es una
    // caja negra y hay que adivinar entre "no existe", "está vacía" y "no
    // llegó al despliegue". Los nombres no son secretos; los valores sí.
    const missing = [];
    if (!GMAIL_USER) missing.push('GMAIL_USER');
    if (!GMAIL_PASS) missing.push('GMAIL_APP_PASSWORD');

    // Qué nombres relacionados existen de verdad en el entorno. Delata el
    // fallo que el panel de Vercel no deja ver: un nombre con un espacio
    // colado o una letra de más se guarda como una variable distinta y
    // parece bien puesta. Solo nombres y longitudes — nunca valores.
    const present = Object.keys(process.env)
      .filter(k => /gmail|mail|reply/i.test(k))
      .map(k => `${JSON.stringify(k)}:${String(process.env[k] || '').length}`);

    console.error('[contact] faltan variables:', missing.join(', '), '| presentes:', present.join(', '));
    return res.status(500).json({ error: 'server_misconfigured', missing, present });
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

  const copy     = REPLY_COPY[lang];
  const subjLine = subject || { es: 'Sin asunto', en: 'No subject', zh: '无主题' }[lang];

  try {
    // El aviso a Yi-Ting es el que no puede fallar: se envía primero y en
    // solitario, para poder distinguirlo del acuse de recibo, que es
    // best-effort.
    await send({
      to: MAIL_TO,
      replyTo: header(`${name} <${email}>`),
      subject: header(`Portfolio — ${subjLine} — ${name}`),
      html: notifyHtml({ name, email, subject: subjLine, message, lang }),
      text: plain([
        'Nuevo mensaje desde lisayangtang.com', '',
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
      to: email,
      replyTo: REPLY_TO,
      subject: header(copy.subject),
      html: replyHtml({ name, subject: subjLine, message, copy }),
      text: plain([
        copy.title, '',
        copy.p1, '',
        copy.p2a + copy.p2b + copy.p2c, '',
        copy.sumEyebrow.replace(/^02 · /, '').toUpperCase(), '',
        `${copy.lName}: ${name}`,
        `${copy.lSubject}: ${subjLine}`,
        `${copy.lMessage}: ${message}`, '',
        copy.bye,
        'Lisa · Yi-Ting Yang Tang',
        copy.role, '',
        ...LINKS.map(([l, u]) => `${l}: ${u}`), '',
        copy.auto,
      ]),
    });
  } catch (err) {
    console.error('[contact] acuse de recibo no entregado:', err.message);
  }

  return res.status(200).json({ ok: true });
};
