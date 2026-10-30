# Altura — Clima en tiempo real

Aplicación web del clima, hecha con HTML, CSS y JavaScript puro (sin frameworks, sin dependencias y **sin API key**). Muestra el clima actual, el pronóstico por horas y el de los próximos 7 días para cualquier ciudad del mundo, con un fondo que cambia según las condiciones meteorológicas.

Los datos vienen de [Open-Meteo](https://open-meteo.com/) (geocodificación y pronóstico).

## Características

- **Búsqueda de ciudades** con autocompletado, con espera (debounce) de 300 ms y navegación por teclado (↑ ↓ Enter Esc).
- **Geolocalización** con el botón "Mi ubicación".
- **Clima actual:** temperatura, sensación térmica, máxima y mínima del día, estado del cielo y hora local de la ciudad.
- **Detalles:** humedad (con barra), viento con dirección cardinal, probabilidad de lluvia y sensación térmica con una nota contextual.
- **Próximas 24 horas:** gráfico de barras de temperatura con ícono por hora.
- **Próximos 7 días:** máxima, mínima, ícono y probabilidad de lluvia.
- **Unidades °C / °F**, con la preferencia guardada.
- **Ciudades recientes** (hasta 5) guardadas en el navegador. Al abrir la app se carga automáticamente la última consultada.
- **Fondo dinámico ("mood")** según el código meteorológico y si es de día o de noche: despejado, nublado, lluvia, tormenta, nieve y niebla.
- **Estados de interfaz:** vacío, cargando (skeleton), error con reintento y panel de clima.
- **Accesibilidad:** enlace para saltar al contenido, roles ARIA en el buscador, `prefers-reduced-motion` y foco visible.

## Estructura del proyecto

```
.
├── index.html   # Estructura de la página y paneles de estado
├── style.css    # Estilos, tokens de tema y moods del fondo
├── script.js    # Lógica: API, estado, renderizado y eventos
└── README.md
```

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Barra superior, buscador, hero del clima, tarjetas de detalle, gráfico horario, pronóstico semanal y paneles de estado. |
| `style.css` | Variables de diseño, paletas por mood (`data-mood` en `<html>`), estilo "glass", diseño responsive y movimiento reducido. |
| `script.js` | Cliente de Open-Meteo, mapeo de códigos WMO a íconos y etiquetas, renderizado y persistencia en `localStorage`. |

## Uso

### Ejecutar la app

No requiere instalación ni compilación. A través de tu navegador:

abre `https://alejvndroj.github.io/Geoaltura/`.

Se necesita conexión a internet para consultar la API y para cargar las fuentes de Google Fonts.

### Consultar el clima

1. Escribe al menos 2 letras de una ciudad (por ejemplo, "Medellín" o "Lima") y elige una sugerencia, o pulsa **Enter** para tomar la primera.
2. O pulsa **Usar mi ubicación** y concede el permiso del navegador.
3. Cambia entre **°C** y **°F** desde la barra superior, para alternar entre las unidades de medida Celsius(°C) o Fahrenheit(°F)
4. Usa los chips de **Recientes** para volver a una ciudad consultada antes.

## Cómo funciona

### Flujo de datos

```
Búsqueda ─▶ Geocoding API ─▶ lista de sugerencias
                                   │ (clic / Enter)
                                   ▼
                            Forecast API (lat, lon)
                                   │
                                   ▼
                    state.current = { place, weather }
                                   │
                                   ▼
        renderAll(): mood · hero · bento · horas · 7 días · recientes
```

### APIs utilizadas

| Endpoint | Uso |
|---|---|
| `geocoding-api.open-meteo.com/v1/search` | Buscar ciudades por nombre (hasta 5 resultados, en español). |
| `api.open-meteo.com/v1/forecast` | Clima actual, pronóstico por hora y diario (7 días), con `timezone=auto`. |

### Fondo dinámico

`applyMood()` combina el código WMO con `is_day` y escribe el resultado en `data-mood` del elemento `<html>` (por ejemplo `rain-night` o `clear-day`). El CSS define las paletas para cada mood, así que cambiar un solo atributo actualiza todo el tema. `storm` y `fog` no tienen variante de día y noche.

### Almacenamiento local

| Clave en `localStorage` | Contenido |
|---|---|
| `altura:unit` | Unidad activa: `"c"` o `"f"`. |
| `altura:recent` | Lista de hasta 5 ciudades consultadas (nombre, región, país, coordenadas). |

Si `localStorage` no está disponible (modo privado o cuota llena), la app sigue funcionando pero con falta de consistencia.

## Personalización

- **Cantidad de recientes o tiempo de espera de la búsqueda:** cambia `MAX_RECENT` y `SEARCH_DEBOUNCE_MS` al inicio de `script.js`.
- **Colores de cada clima:** edita los bloques `html[data-mood="..."]` en `style.css`.
- **Íconos:** el objeto `ICONS` en `script.js` contiene los SVG; `WMO` asocia cada código con su etiqueta, ícono y mood.
- **Idioma:** las etiquetas están en español (`es-ES`). Para cambiarlo, ajusta los textos de `WMO`, la compatibilidad de `toLocaleDateString` y el parámetro `language` de la búsqueda.

## Compatibilidad

Funciona en navegadores modernos con soporte para ES2022, `color-mix()` y `backdrop-filter`. En navegadores antiguos el diseño puede verse degradado.

## Créditos

- Datos meteorológicos: [Open-Meteo](https://open-meteo.com/) (uso no comercial gratuito, sin clave de API).
- Tipografías: Instrument Sans y JetBrains Mono, vía Google Fonts.
- Gamecode: (https://gamecode.me/)