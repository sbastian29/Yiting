# Lisa · Portfolio — Guía para Claude

Portfolio personal de **Yi-Ting Yang Tang (Lisa)**, 3D modeling & texturing artist con base en Madrid.

## Stack

Sitio estático **sin build step**. Todo se sirve tal cual desde el directorio raíz:

- **HTML** plano (`index.html`, `certifications.html`) como puntos de entrada.
- **React 18** cargado por CDN (UMD) desde `unpkg.com`.
- **Babel Standalone** compila los `.jsx` en el navegador (`<script type="text/babel">`).
- **Three.js 0.158** para escenas 3D.
- **GSAP 3.12 + ScrollTrigger** y **Lenis 1.1** para animaciones y smooth scroll.
- Sin bundler, sin npm, sin transpilación previa. Los cambios se ven recargando el navegador.

## Estructura

```
index.html              # Entrada principal — carga todos los src/*.jsx en orden
certifications.html     # Página secundaria de certificaciones
src/
  lib.jsx               # Utilidades base (se carga primero)
  scroll.jsx            # Lenis + ScrollTrigger
  transitions.jsx       # Transiciones entre rutas
  preloader.jsx         # Pantalla de carga
  cursor.jsx            # Cursor custom
  chrome.jsx            # Header / nav / layout global
  sellos.jsx            # Sellos / badges decorativos
  home.jsx              # Página home
  work.jsx              # Sección Work
  about.jsx             # Sección About
  play.jsx              # Sección Play (experimentos)
  contact.jsx           # Formulario contacto
  imageflow.jsx         # Componente flujo de imágenes
  certifications.jsx    # Componente certificaciones
  app.jsx               # Root del árbol React (se carga al final)
styles/
  tokens.css            # Design tokens (colores, tipografías, escalas)
  global.css            # Reset + base
  pages.css             # Estilos por sección
  certifications.css
data/                   # JSON con contenido editable
  bio.json
  work.json
  play.json
  skills.json
  milestones.json
  certifications.json
assets/                 # Logos, favicons, imágenes usadas por el sitio
  logos/
  soft/
screenshots/            # Capturas de trabajo (referencia, no publicadas)
uploads/                # Material sin uso — ver nota abajo
```

## Convenciones

- **Orden de carga** de scripts en `index.html` es significativo: `lib.jsx` primero, `app.jsx` último. Al añadir un módulo nuevo, insertarlo respetando sus dependencias.
- **JSX en el navegador**: no usar sintaxis que Babel Standalone no soporte (ej. features stage-0). Preferir React clásico + hooks.
- **Sin imports ES**: los `.jsx` comparten scope global. Exponer utilidades en `window.*` o mediante `lib.jsx`.
- **CSS**: usar tokens de `tokens.css` (variables CSS) antes de hardcodear valores.
- **Datos** editables viven en `data/*.json` — separados del código de presentación.
- **Idioma**: HTML en `es`; el sitio mezcla ES/EN según sección. Copy en español salvo indicación contraria.

## Desarrollo local

Al ser estático, cualquier servidor http sirve:

```powershell
# Con Python
python -m http.server 8000

# Con Node (npx)
npx serve .
```

Abrir `http://localhost:8000`. **No** abrir `index.html` con `file://` — Babel/CDN pueden fallar por CORS.

## Notas

- `uploads/` contiene imágenes generadas por IA (bocetos abstractos, logos de herramientas) y una copia antigua completa del proyecto en `Y4 (1)/`. **No está referenciada por ningún archivo** — se puede eliminar sin impacto. Está incluida en `.gitignore` por si se quiere conservar localmente.
- `screenshots/` es material de referencia de desarrollo (hover states, tests visuales), no assets publicados. Ignorada por git.
- Fuentes se cargan desde Google Fonts (Cormorant Garamond, Syne, DM Sans, Martian Mono, Noto Sans SC).
- Canonical URL: `https://lisayangtang.com/`.
