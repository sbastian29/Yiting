# Lisa · Portfolio — Guía para Claude

Portfolio personal de **Yi-Ting Yang Tang** (alias Lisa), 3D modeling & texturing artist con base en Madrid.

## Stack

Sitio estático **sin build step**. Todo se sirve tal cual desde el directorio raíz:

- **HTML** plano como puntos de entrada (una página = un `.html` autónomo).
- **React 18** cargado por CDN (UMD) desde `unpkg.com`.
- **Babel Standalone** compila los `.jsx` en el navegador (`<script type="text/babel">`).
- **GSAP 3.12** para animaciones (el nav y los overlays).
- **WebGL crudo** (sin Three.js) para el shader ambiente del formulario — vive en `lib.jsx`.
- Sin bundler y sin transpilación previa. Los cambios se ven recargando el navegador.
- **El front no usa npm.** El `package.json` de la raíz existe solo para que Vercel instale
  `nodemailer`, que necesita la función serverless de `api/contact.js`. No metas dependencias de
  front ahí, y **no le añadas un script `build`**: en cuanto existe, Vercel deja de tratar el
  proyecto como estático, busca una carpeta de salida, no la encuentra y el despliegue falla con
  `No Output Directory named "public" found`. `vercel.json` fija `outputDirectory: "."` y
  `buildCommand: null` justamente para dejar eso claro.

## Páginas

El sitio son **dos páginas independientes**. No hay router ni SPA: cada `.html` monta su propio
`ReactDOM.createRoot` y no comparten estado.

| URL | Fichero | Contenido | Etiqueta en el nav |
|---|---|---|---|
| `/` | `index.html` | **Work / CV** — sidebar con scroll propio + carrusel de tarjetas | `Work` |
| `/titulos.html` | `titulos.html` | **Títulos** — grid de premios, becas y certificaciones | `Títulos` |
| `/certifications.html` | — | Solo un **redirect** a `/` | — |

> **Ojo con los nombres:** `certifications.html` **no** es la página de certificaciones. Antes
> contenía el archivo de trabajos; hoy es un stub que redirige a `/` para no romper enlaces ya
> compartidos. La página de certificaciones real es `titulos.html`.

### `index.html` — Work / CV

Grid de tres columnas (`34% | 1fr | 44px`):

- **Izquierda** (scroll manual propio): marca + cargo → pills de filtro → grid de softwares →
  titular → enlaces sociales → trayectoria → contador → formulario de contacto.
- **Centro**: carrusel de doble columna con auto-scroll infinito (rAF, ~0.5 px/frame), acelerado
  con la rueda y pausado al hover, con el overlay abierto, bajo 900px o con `prefers-reduced-motion`.
- **Derecha**: rail de etiquetas verticales.

Click en una tarjeta abre un overlay con una imagen grande y los metadatos.

### `titulos.html` — Títulos

Página larga y simple: cabecera (h1 + lede + 3 stats calculadas) → buscador → chips de filtro por
tipo y por emisor → contador + reset → grid de tarjetas → estado vacío → footer.

Filtrado en cliente: AND entre grupos, OR dentro de cada grupo, más búsqueda libre sobre título,
emisor, descripción y skills. Los chips de un grupo solo se pintan si hay más de un valor real,
para no ofrecer filtros que siempre den cero.

## Estructura

```
index.html              # Work / CV  (landing)
titulos.html            # Títulos / credenciales
certifications.html     # redirect → index.html

src/
  lib.jsx               # base: Mouse, LangContext, ToastProvider, ShaderCanvas,
                        #   useViewport, lockBodyScroll… (se carga primero)
  cursor.jsx            # cursor custom (punto + anillo + estela)
  contact.jsx           # <ContactForm/> — tarjeta de cristal con tilt 3D
  archive.jsx           # página Work / CV      (index.html)
  titulos.jsx           # página Títulos        (titulos.html)

styles/
  tokens.css            # design tokens (colores, tipografías, escalas)
  global.css            # reset + base + estilos del cursor custom
  nav.css               # NavBar flotante — compartida por ambas páginas
  archive.css           # estilos de index.html (incluye el formulario .cf-*)
  titulos.css           # estilos de titulos.html

data/                   # JSON editable — el contenido se toca aquí, no en el código
  works.json            # 7 proyectos 3D del carrusel
  softwares.json        # 10 logos del bloque SOFTWARES
  trayectoria.json      # entradas de la trayectoria (placeholders)
  titulos.json          # premios / becas / certificaciones (placeholders)
  bio.json              # nombre y cargo (fuente única de verdad)

assets/
  Works/                # una carpeta por proyecto (ver abajo)
  logos/                # logos de software
```

### Orden de carga

Es significativo. `lib.jsx` siempre primero (define `Mouse`, `ShaderCanvas`, los providers);
la página concreta siempre al final.

- `index.html` → `lib.jsx` → `contact.jsx` → `cursor.jsx` → `archive.jsx`
- `titulos.html` → `lib.jsx` → `cursor.jsx` → `titulos.jsx`

Los `.jsx` comparten scope global: no hay imports ES. Para exponer algo entre ficheros se usa
`Object.assign(window, { … })` al final del módulo.

## Assets de proyecto

`assets/Works/` tiene **una carpeta por proyecto**, nombrada tal cual la nombró Yi-Ting:

```
assets/Works/3D Stylised Crystal Dagger/
  Icono.png     ← miniatura de la tarjeta
  1.png … 8.png ← galería (hoy solo se usa una como imagen grande del overlay)
```

Los 7 proyectos actuales: Crystal Dagger, Longsword, Low-Poly Fantasy Crossbow, Scythe, Ice Axe
(los cinco en `weapons`), Demon Chest Mimic (`props`) y Altar (`environment`).

**Los nombres de carpeta llevan espacios.** En `works.json` la ruta se guarda en crudo para que
sea editable a mano, y se codifica al construir el `src` con el helper `assetUrl()` de
`archive.jsx`. No metas rutas ya escapadas en el JSON.

El Altar es el único sin `Icono.png` — usa `001.png` como miniatura.

## Formulario de contacto

Vive en `contact.jsx` (`<ContactForm/>`) y se monta en el sidebar de `index.html`. Envía por AJAX a
**`/api/contact`**, la función serverless de `api/contact.js`. Manda `name`, `email`, `subject`,
`message`, el `lang` activo y `company` (el honeypot).

El front cubre cuatro caminos: éxito (checkmark animado), errores de validación del servidor
(`{ errors: [{ field, message }] }`), rate-limit (429) y fallo de red.

### `api/contact.js`

Por cada envío manda **dos correos**, y esto no es negociable: el aviso a Yi-Ting (con `Reply-To`
del visitante, para responder de un clic) y un acuse de recibo al visitante en su idioma.

- **Transporte: SMTP de Gmail** vía `nodemailer`, autenticando con una **contraseña de
  aplicación**. Se eligió frente a Resend/Formspree porque es la única vía gratuita de que el
  correo salga **desde `lisayitingyang@gmail.com`**: los proveedores externos exigen un dominio
  verificado por DNS, y Yi-Ting no tiene dominio propio. La dirección del `From` **no se puede
  cambiar** — Gmail solo envía desde la cuenta autenticada; lo único configurable es el nombre
  visible (`MAIL_FROM_NAME`).
- **El aviso a Yi-Ting es el envío crítico**: va primero y, si falla, la API devuelve 502. El
  acuse de recibo es best-effort — si se cae, el mensaje ya llegó y el visitante no ve un error.
- Defensas: validación en servidor, honeypot (`company`), rate-limit por IP (5/min, en memoria),
  escapado de HTML y limpieza de CR/LF en las cabeceras.
- Las plantillas HTML van con `<table>` y `style=` inline, sin webfonts (Georgia / Arial /
  Courier New): Gmail borra las hojas de estilo y Outlook renderiza con el motor de Word.

Variables de entorno, en Vercel → Settings → Environment Variables (ver `.env.example`):
`GMAIL_USER`, `GMAIL_APP_PASSWORD` (obligatorias), `MAIL_TO`, `REPLY_TO`, `MAIL_FROM_NAME`.

Email de contacto: `lisayitingyang@gmail.com`.

## Convenciones

- **CSS**: usar los tokens de `tokens.css` antes de hardcodear valores. Clases con prefijo por
  página: `.arc-*` en el archivo (Work), `.tt-*` en Títulos, `.cf-*` en el formulario.
- **Datos** editables en `data/*.json`, separados del código de presentación. Los campos vacíos
  deben ocultar su fila o su control, nunca pintar un hueco.
- **JSX en el navegador**: nada que Babel Standalone no soporte. React clásico + hooks.
- **Idioma**: HTML en `es`. El copy mezcla ES/EN según la sección.
- **Accesibilidad**: los controles interactivos llevan `min-height: var(--touch-min)` (44px), y los
  inputs `font-size: 16px` para que iOS Safari no haga zoom al enfocar.

### Trampa del cursor

`global.css` esconde el cursor nativo en punteros finos:

```css
@media (pointer: fine) { body, a, button, [data-cursor] { cursor: none; } }
```

Así que **toda página nueva tiene que montar `<CustomCursor/>`** (cargando `cursor.jsx` y
renderizándolo), o se queda literalmente sin puntero visible. Ya pasó una vez.

## Desarrollo local

Al ser estático, cualquier servidor http sirve:

```powershell
python -m http.server 8080
# o
npx serve .
```

Abrir `http://localhost:8080`. **No** abrir con `file://` — Babel y los `fetch` de los JSON fallan
por CORS.

### Comprobar sintaxis sin abrir el navegador

Como Babel corre en el navegador, un error de sintaxis solo aparece en la consola al cargar la
página. Para verlo antes, este script se trae Babel del CDN y compila los ficheros que le pases —
no instala nada ni necesita `node_modules`:

```js
// tools/check-jsx.mjs   ·   uso:  node tools/check-jsx.mjs src/*.jsx
import fs from 'node:fs';
const src = await (await fetch('https://unpkg.com/@babel/standalone@7.29.0/babel.min.js')).text();
const m = { exports: {} };
new Function('module','exports','window','self','global', src)(m, m.exports, {}, {}, {});
let bad = 0;
for (const f of process.argv.slice(2)) {
  try { m.exports.transform(fs.readFileSync(f,'utf8'), { presets:['react'] }); console.log('OK   ' + f); }
  catch (e) { bad++; console.log('FAIL ' + f + ': ' + e.message); }
}
process.exit(bad ? 1 : 0);
```

Ojo: eso valida **sintaxis**, no que la página funcione. Un export que falte o un provider mal
montado solo se ve cargando la página y mirando la consola.

## Deuda conocida

- **Ficheros huérfanos del SPA retirado.** Siguen en el repo pero **no los carga ninguna página**:
  `src/app.jsx`, `chrome.jsx`, `work.jsx` (galería orbital Three.js), `scroll.jsx` (Lenis),
  `transitions.jsx`, `preloader.jsx`, `imageflow.jsx`, `sellos.jsx`, `home.jsx`, `about.jsx`,
  `play.jsx`, más `styles/pages.css`. Y con ellos, estos JSON: `work.json`, `play.json`,
  `skills.json`, `milestones.json`, `certifications.json` (contiene credenciales que **no son de
  Yi-Ting**). Se puede borrar todo, pendiente de confirmación.
- **Rendimiento.** Babel transpila ~2500 líneas en cada carga y el cursor mantiene un rAF
  permanente. La extensión de Chrome no consigue ni inyectar un script para hacer capturas, señal
  de que el hilo principal va justo. Precompilar los `.jsx` sería la mejora grande.
- **Placeholders sin rellenar**: `trayectoria.json` y `titulos.json` están con contenido de relleno
  marcado, y en `works.json` los campos `year`, `software` y `description` están vacíos.

## Notas

- Fuentes desde Google Fonts (Cormorant Garamond, Syne, DM Sans, Martian Mono, Noto Sans SC).
- Canonical URL: `https://lisayangtang.com/`.
- `uploads/` y `screenshots/` son material de referencia, no están referenciados por el sitio y
  están ignorados por git.
