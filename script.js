/* =============================================================
   Altura — App del clima (vanilla JS ES2022+)
   API: Open-Meteo (geocoding + forecast), sin API key.
   Patrones: state-driven render, AbortController, debounce,
   localStorage para unidad/recientes, WMO code mapping.
   ============================================================= */
   (() => {
    "use strict";
  
    /* --- 1. Configuracion y helpers ---------------------------- */
    const API = {
      GEO: "https://geocoding-api.open-meteo.com/v1/search",
      FORECAST: "https://api.open-meteo.com/v1/forecast",
    };
  
    const LS = {
      UNIT: "altura:unit",
      RECENT: "altura:recent",
    };
  
    const MAX_RECENT = 5;
    const SEARCH_DEBOUNCE_MS = 300;
  
    // Atajos cortos tipo jQuery, para no repetir document.querySelector en todos lados
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  
    /* Debounce: agrupa varias llamadas seguidas en una sola despues de "wait" ms
       de inactividad. Lo usamos en el input de busqueda para no pegarle a la
       API con cada letra que tipea el usuario. */
    const debounce = (fn, wait) => {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    };
  
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  
    /* Wrappers seguros para localStorage: si falla (modo privado, cuota),
       devolvemos un fallback sin crashear la app. */
    const safeJson = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };
  
    const writeJson = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* cuota llena o modo privado */
      }
    };
  
    /* Toast simple: muestra un mensaje unos segundos en la parte inferior.
       Si el elemento #toast no existe en el HTML, lo crea. */
    const toast = (msg) => {
      let el = $("#toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        el.className = "toast";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.hidden = false;
      requestAnimationFrame(() => el.setAttribute("data-open", "true"));
      clearTimeout(toast._t);
      toast._t = setTimeout(() => {
        el.removeAttribute("data-open");
        setTimeout(() => (el.hidden = true), 260);
      }, 2400);
    };
  
    /* --- 2. WMO weather codes ---------------------------------- *
     * Mapeo oficial: https://open-meteo.com/en/docs
     * Agrupamos en "buckets" para iconografia y mood del fondo.
     * ---------------------------------------------------------- */
    const WMO = {
      0: { label: "Despejado", icon: "sun", mood: "clear" },
      1: { label: "Mayormente despejado", icon: "sun-cloud", mood: "clear" },
      2: { label: "Parcialmente nublado", icon: "sun-cloud", mood: "cloudy" },
      3: { label: "Nublado", icon: "cloud", mood: "cloudy" },
      45: { label: "Niebla", icon: "fog", mood: "fog" },
      48: { label: "Niebla con escarcha", icon: "fog", mood: "fog" },
      51: { label: "Llovizna ligera", icon: "drizzle", mood: "rain" },
      53: { label: "Llovizna moderada", icon: "drizzle", mood: "rain" },
      55: { label: "Llovizna intensa", icon: "drizzle", mood: "rain" },
      56: { label: "Llovizna helada", icon: "drizzle", mood: "rain" },
      57: { label: "Llovizna helada intensa", icon: "drizzle", mood: "rain" },
      61: { label: "Lluvia ligera", icon: "rain", mood: "rain" },
      63: { label: "Lluvia moderada", icon: "rain", mood: "rain" },
      65: { label: "Lluvia intensa", icon: "rain", mood: "rain" },
      66: { label: "Lluvia helada", icon: "rain", mood: "rain" },
      67: { label: "Lluvia helada intensa", icon: "rain", mood: "rain" },
      71: { label: "Nevada ligera", icon: "snow", mood: "snow" },
      73: { label: "Nevada moderada", icon: "snow", mood: "snow" },
      75: { label: "Nevada intensa", icon: "snow", mood: "snow" },
      77: { label: "Granos de nieve", icon: "snow", mood: "snow" },
      80: { label: "Chubascos ligeros", icon: "rain", mood: "rain" },
      81: { label: "Chubascos moderados", icon: "rain", mood: "rain" },
      82: { label: "Chubascos violentos", icon: "rain", mood: "rain" },
      85: { label: "Chubascos de nieve", icon: "snow", mood: "snow" },
      86: { label: "Chubascos intensos de nieve", icon: "snow", mood: "snow" },
      95: { label: "Tormenta eléctrica", icon: "storm", mood: "storm" },
      96: { label: "Tormenta con granizo", icon: "storm", mood: "storm" },
      99: { label: "Tormenta con granizo fuerte", icon: "storm", mood: "storm" },
    };
  
    // Fallback si la API devuelve un codigo que no conocemos
    const wmo = (code) =>
      WMO[code] ?? { label: "Desconocido", icon: "cloud", mood: "cloudy" };
  
    // Combina el mood base con is_day (1 = dia, 0 = noche)
    // storm y fog no tienen variante dia/noche: son "neutros"
    const moodFor = (code, isDay) => {
      const m = wmo(code).mood;
      if (m === "storm" || m === "fog") return m;
      return `${m}-${isDay ? "day" : "night"}`;
    };
  
    /* --- 3. SVG icons (sprite-less, renderizados al vuelo) ------ */
    const ICONS = {
      sun: `<svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="12" fill="currentColor"/>
        <g stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
          <path d="M32 6v6M32 52v6M6 32h6M52 32h6M13 13l4 4M47 47l4 4M51 13l-4 4M17 47l-4 4"/>
        </g></svg>`,
      "sun-cloud": `<svg viewBox="0 0 64 64" fill="none">
        <circle cx="24" cy="22" r="9" fill="currentColor"/>
        <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M24 4v4M24 36v4M6 22h4M38 22h4M10 10l3 3M35 35l3 3M38 10l-3 3M13 35l-3 3"/>
        </g>
        <path d="M20 46c0-6 5-10 11-10 5 0 9 3 11 7a7 7 0 0 1-1 14H22a8 8 0 0 1-2-11Z"
          fill="currentColor" opacity="0.85"/></svg>`,
      cloud: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M16 44c0-9 7-16 16-16 7 0 13 4 16 10a10 10 0 0 1-3 20H22a8 8 0 0 1-6-14Z"
          fill="currentColor"/></svg>`,
      fog: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M16 34c0-8 6-14 14-14 6 0 11 3 13 9a8 8 0 0 1-2 16H22a7 7 0 0 1-6-11Z"
          fill="currentColor" opacity="0.9"/>
        <g stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7">
          <path d="M10 50h44M14 58h36"/>
        </g></svg>`,
      drizzle: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M16 34c0-9 7-16 16-16 7 0 13 4 15 10a9 9 0 0 1-3 18H22a8 8 0 0 1-6-12Z"
          fill="currentColor"/>
        <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
          <path d="M22 52l-3 6M34 52l-3 6M46 52l-3 6"/>
        </g></svg>`,
      rain: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M16 30c0-9 7-16 16-16 7 0 13 4 15 10a9 9 0 0 1-3 18H22a8 8 0 0 1-6-12Z"
          fill="currentColor"/>
        <g stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <path d="M22 48l-4 8M34 48l-4 8M46 48l-4 8"/>
        </g></svg>`,
      snow: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M16 30c0-9 7-16 16-16 7 0 13 4 15 10a9 9 0 0 1-3 18H22a8 8 0 0 1-6-12Z"
          fill="currentColor"/>
        <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M22 50v6M19 53h6M34 50v6M31 53h6M46 50v6M43 53h6"/>
        </g></svg>`,
      storm: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M16 30c0-9 7-16 16-16 7 0 13 4 15 10a9 9 0 0 1-3 18H22a8 8 0 0 1-6-12Z"
          fill="currentColor"/>
        <path d="M30 42l-6 10h8l-4 10 10-14h-8l5-6z" fill="#ffd24a" stroke="#000"
          stroke-width="0.5" stroke-linejoin="round"/></svg>`,
      drop: `<svg viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 1.5 3.2 6.2a3.2 3.2 0 1 0 5.6 0L6 1.5Z"/></svg>`,
    };
  
    const iconFor = (code) => ICONS[wmo(code).icon] ?? ICONS.cloud;
  
    /* --- 4. Conversiones y formatters -------------------------- */
    const cToF = (c) => (c * 9) / 5 + 32;
  
    const fmtTemp = (c, unit) => {
      if (c == null || Number.isNaN(c)) return "—";
      const v = unit === "f" ? cToF(c) : c;
      return Math.round(v).toString();
    };
  
    const unitSym = (unit) => (unit === "f" ? "°F" : "°C");
  
    const WIND_COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    const windDir = (deg) => {
      if (deg == null) return "";
      const i = Math.round((deg % 360) / 45) % 8;
      return WIND_COMPASS[i];
    };
  
    const dayNameShort = (isoDate) => {
      const d = new Date(isoDate + "T00:00:00");
      return d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
    };
  
    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  
    /* --- 5. State ---------------------------------------------- */
    const state = {
      unit: safeJson(LS.UNIT, "c"),
      recent: safeJson(LS.RECENT, []),
      current: null, // { place, weather }
      searchCtrl: null,
      weatherCtrl: null,
    };
  
    /* --- 6. API client (con AbortController) ------------------- */
    const fetchJSON = async (url, { signal } = {}) => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    };
  
    const searchCities = async (query, signal) => {
      const url = new URL(API.GEO);
      url.searchParams.set("name", query);
      url.searchParams.set("count", "5");
      url.searchParams.set("language", "es");
      url.searchParams.set("format", "json");
      const data = await fetchJSON(url.toString(), { signal });
      return data.results ?? [];
    };
  
    const getWeather = async (lat, lng, signal) => {
      const url = new URL(API.FORECAST);
      url.searchParams.set("latitude", lat);
      url.searchParams.set("longitude", lng);
      url.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day,precipitation"
      );
      url.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max"
      );
      url.searchParams.set(
        "hourly",
        "temperature_2m,weather_code,precipitation_probability"
      );
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("forecast_days", "7");
      return fetchJSON(url.toString(), { signal });
    };
  
    /* --- 7. Estados UI (switcher) ------------------------------ */
    const PANELS = ["state-empty", "state-loading", "state-error", "weather"];
  
    const showPanel = (id) => {
      PANELS.forEach((p) => {
        const el = document.getElementById(p);
        if (!el) return;
        const active = p === id;
        el.hidden = !active;
        // El loading tambien actualiza aria-hidden para que los lectores de pantalla
        // no anuncien el skeleton.
        if (p === "state-loading") {
          el.setAttribute("aria-hidden", active ? "false" : "true");
        }
      });
    };
  
    /* --- 8. Aplicar mood al documento -------------------------- */
    const applyMood = (weatherCode, isDay) => {
      const mood = moodFor(weatherCode, isDay);
      // Esta sola linea dispara todo el cambio de paleta via CSS
      document.documentElement.setAttribute("data-mood", mood);
  
      // Sincronizamos el meta theme-color con el --sky-2 actual
      // (color de la barra de estado en mobile)
      const themeColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--sky-2")
        .trim();
      if (themeColor) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", themeColor);
      }
    };
  
    /* --- 9. Render del hero card ------------------------------- */
    const renderHero = (place, w) => {
      const c = w.current;
      const meta = wmo(c.weather_code);
  
      $("#hero-city").textContent = place.name;
      $("#hero-country").textContent =
        [place.admin1, place.country].filter(Boolean).join(", ") || "—";
  
      // Icono SVG grande: va con innerHTML porque es markup
      $("#hero-icon").innerHTML = iconFor(c.weather_code);
  
      $("#hero-temp").textContent = fmtTemp(c.temperature_2m, state.unit);
      $("#hero-unit").textContent = unitSym(state.unit);
      $("#hero-state").textContent = meta.label;
  
      $("#hero-feels").textContent =
        `${fmtTemp(c.apparent_temperature, state.unit)}${unitSym(state.unit)}`;
  
      const today = w.daily;
      const max = fmtTemp(today.temperature_2m_max[0], state.unit);
      const min = fmtTemp(today.temperature_2m_min[0], state.unit);
      $("#hero-range").textContent = `Máx ${max}° · Mín ${min}°`;
  
      // Hora local de la ciudad (gracias al timezone=auto del endpoint)
      const now = new Date(w.current.time);
      $("#hero-stamp").textContent =
        now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) +
        " hora local";
    };
  
    /* --- 10. Render del bento ---------------------------------- */
    const renderBento = (w) => {
      const c = w.current;
      const d = w.daily;
  
      // Humedad (con barra)
      $("#m-humidity").textContent = Math.round(c.relative_humidity_2m ?? 0);
      $("#m-humidity-bar").style.width =
        clamp(c.relative_humidity_2m ?? 0, 0, 100) + "%";
  
      // Viento (velocidad + direccion cardinal)
      $("#m-wind").textContent = Math.round(c.wind_speed_10m ?? 0);
      $("#m-wind-dir").textContent = windDir(c.wind_direction_10m) || "—";
  
      // Probabilidad de lluvia del dia 0
      const rain = d.precipitation_probability_max?.[0] ?? 0;
      $("#m-rain").textContent = Math.round(rain);
  
      // Sensacion termica + hint contextual
      $("#m-feels").textContent = fmtTemp(c.apparent_temperature, state.unit);
      $("#m-feels-unit").textContent = unitSym(state.unit);
      const diff = (c.apparent_temperature ?? 0) - (c.temperature_2m ?? 0);
      let feelsHint = "Sin diferencia";
      if (diff >= 2) feelsHint = "Se siente más caluroso";
      else if (diff <= -2) feelsHint = "Se siente más frío";
      $("#m-feels-hint").textContent = feelsHint;
    };
  
    /* --- 11. Render del grafico horario ------------------------ */
    const renderHourly = (w) => {
      const chart = $("#hourly-chart");
      chart.innerHTML = "";
  
      const times = w.hourly.time;
      const temps = w.hourly.temperature_2m;
      const codes = w.hourly.weather_code;
  
      // Encontramos el indice de la hora actual dentro del array horario
      const now = new Date(w.current.time);
      let startIdx = times.findIndex(
        (t) =>
          new Date(t).getHours() === now.getHours() &&
          isSameDay(new Date(t), now)
      );
      if (startIdx < 0) startIdx = 0;
      const endIdx = Math.min(startIdx + 24, times.length);
  
      // Armamos un array de 24 puntos desde la hora actual
      const slice = times.slice(startIdx, endIdx).map((t, i) => ({
        t,
        temp: temps[startIdx + i],
        code: codes[startIdx + i],
      }));
      if (slice.length === 0) return;
  
      // Convertimos todas las temps a la unidad activa para el calculo del rango
      const values = slice.map((s) =>
        state.unit === "f" ? cToF(s.temp) : s.temp
      );
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, 1); // Evitamos division por 0
  
      // Construimos el DOM dentro de un fragment (menos reflows)
      const frag = document.createDocumentFragment();
      slice.forEach((s, i) => {
        const v = values[i];
        // Altura proporcional: 10% (minimo) a 80% (maximo del dia)
        const heightPct = 10 + ((v - min) / range) * 70;
        const hourDate = new Date(s.t);
        const isNow = i === 0;
        const label = isNow
          ? "Ahora"
          : hourDate.toLocaleTimeString("es-ES", { hour: "2-digit" });
  
        const bar = document.createElement("div");
        bar.className = "hourly__bar" + (isNow ? " hourly__bar--now" : "");
        bar.innerHTML = `
          <span class="hourly__bar-val">${Math.round(v)}°</span>
          <span class="hourly__bar-fill" style="height:${heightPct}%"></span>
          <span class="hourly__bar-icon">${iconFor(s.code)}</span>
          <span class="hourly__bar-hour">${label}</span>
        `;
        frag.appendChild(bar);
      });
      chart.appendChild(frag);
    };
  
    /* --- 12. Render del forecast 7 dias ------------------------ */
    const renderForecast = (w) => {
      const list = $("#forecast-list");
      list.innerHTML = "";
  
      const d = w.daily;
      const today = new Date();
      const frag = document.createDocumentFragment();
  
      d.time.forEach((iso, i) => {
        const date = new Date(iso + "T00:00:00");
        const isToday = isSameDay(date, today);
        const dayLabel = isToday ? "Hoy" : dayNameShort(iso);
        const max = fmtTemp(d.temperature_2m_max[i], state.unit);
        const min = fmtTemp(d.temperature_2m_min[i], state.unit);
        const rain = d.precipitation_probability_max?.[i] ?? 0;
  
        const li = document.createElement("li");
        li.className = "forecast__item";
  
        li.innerHTML = `
          <span class="forecast__day">${dayLabel}</span>
          <span class="forecast__icon">${iconFor(d.weather_code[i])}</span>
          <span class="forecast__temps">
            <span class="forecast__max">${max}°</span>
            <span class="forecast__min">${min}°</span>
          </span>
          ${rain > 10 ? `<span class="forecast__rain">${ICONS.drop} ${Math.round(rain)}%</span>` : ""}
        `;
  
        frag.appendChild(li);
      });
  
      list.appendChild(frag);
    };
  
    /* --- 13. Render orquestador -------------------------------- */
    const renderAll = () => {
      if (!state.current) return;
      const { place, weather } = state.current;
      applyMood(weather.current.weather_code, weather.current.is_day === 1);
      renderHero(place, weather);
      renderBento(weather);
      renderHourly(weather);
      renderForecast(weather);
      renderRecent();
      showPanel("weather");
    };
  
    /* --- 14. Recientes (persistencia + chips) ------------------ */
    const pushRecent = (place) => {
      const key = `${place.latitude},${place.longitude}`;
      // Si ya estaba, la sacamos para que no se duplique
      const filtered = state.recent.filter(
        (p) => `${p.latitude},${p.longitude}` !== key
      );
      filtered.unshift({
        id: place.id ?? key,
        name: place.name,
        admin1: place.admin1 ?? "",
        country: place.country ?? "",
        country_code: place.country_code ?? "",
        latitude: place.latitude,
        longitude: place.longitude,
      });
      state.recent = filtered.slice(0, MAX_RECENT);
      writeJson(LS.RECENT, state.recent);
    };
  
    const renderRecent = () => {
      const wrap = $("#recent");
      wrap.innerHTML = "";
      if (state.recent.length === 0) return;
  
      const label = document.createElement("span");
      label.className = "recent__label";
      label.textContent = "Recientes";
      wrap.appendChild(label);
  
      state.recent.forEach((p) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "recent__chip";
        chip.textContent = p.name + (p.country_code ? ` · ${p.country_code}` : "");
        chip.addEventListener("click", () => loadPlace(p));
        wrap.appendChild(chip);
      });
    };
  
    /* --- 15. Error panel --------------------------------------- */
    const showError = (title, text) => {
      $("#error-title").textContent = title;
      $("#error-text").textContent = text;
      showPanel("state-error");
    };
  
    /* --- 16. Flujo principal: cargar una ciudad ---------------- */
    const loadPlace = async (place) => {
      // Abortamos request anterior si estaba en vuelo
      state.weatherCtrl?.abort();
      state.weatherCtrl = new AbortController();
  
      showPanel("state-loading");
      closeSuggestions();
      $("#city-input").value = place.name;
      $("#search-clear").hidden = false;
  
      try {
        const weather = await getWeather(
          place.latitude,
          place.longitude,
          state.weatherCtrl.signal
        );
        state.current = { place, weather };
        pushRecent(place);
        renderAll();
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        showError(
          "No pudimos obtener el clima",
          "Revisá tu conexión e intentalo de nuevo en unos segundos."
        );
      }
    };
  
    /* --- 17. Autocomplete (search) ----------------------------- */
    const sugBox = $("#suggestions");
    const sugOwner = sugBox.parentElement;
  
    let activeSuggestion = -1;
    let lastSuggestions = [];
  
    const openSuggestions = () => {
      sugBox.setAttribute("data-open", "true");
      sugOwner.setAttribute("aria-expanded", "true");
    };
    const closeSuggestions = () => {
      sugBox.removeAttribute("data-open");
      sugOwner.setAttribute("aria-expanded", "false");
      activeSuggestion = -1;
    };
  
    // Escape basico para prevenir XSS si el nombre de ciudad trae caracteres raros
    const escapeHtml = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
  
    const renderSuggestions = (items) => {
      sugBox.innerHTML = "";
      lastSuggestions = items;
  
      if (items.length === 0) {
        const empty = document.createElement("li");
        empty.className = "suggestions__empty";
        empty.textContent = "Ninguna ciudad encontrada";
        sugBox.appendChild(empty);
      } else {
        items.forEach((it, i) => {
          const li = document.createElement("li");
          li.className = "suggestions__item";
          li.setAttribute("role", "option");
          li.dataset.idx = i;
          const region = [it.admin1, it.country].filter(Boolean).join(", ");
          li.innerHTML = `<span><b>${escapeHtml(it.name)}</b>
            <small>${escapeHtml(region)}</small></span>
            <small>${escapeHtml(it.country_code ?? "")}</small>`;
          li.addEventListener("click", () => loadPlace(it));
          sugBox.appendChild(li);
        });
      }
      openSuggestions();
    };
  
    const runSearch = async (query) => {
      state.searchCtrl?.abort();
      state.searchCtrl = new AbortController();
      try {
        const results = await searchCities(query, state.searchCtrl.signal);
        renderSuggestions(results);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        renderSuggestions([]);
      }
    };
  
    // Debounced: solo ejecuta 300ms despues de la ultima letra tipeada
    const onInput = debounce((e) => {
      const q = e.target.value.trim();
      $("#search-clear").hidden = q.length === 0;
      if (q.length < 2) {
        closeSuggestions();
        return;
      }
      runSearch(q);
    }, SEARCH_DEBOUNCE_MS);
  
    // Navegacion con flechas: mueve el "aria-selected" arriba/abajo
    const moveSuggestion = (delta) => {
      if (lastSuggestions.length === 0) return;
      activeSuggestion = clamp(
        activeSuggestion + delta,
        0,
        lastSuggestions.length - 1
      );
      $$(".suggestions__item", sugBox).forEach((el, i) => {
        if (i === activeSuggestion) el.setAttribute("aria-selected", "true");
        else el.removeAttribute("aria-selected");
      });
    };
  
    /* --- 18. Geolocalizacion ----------------------------------- */
    const useGeolocation = () => {
      if (!("geolocation" in navigator)) {
        toast("Tu navegador no soporta geolocalización");
        return;
      }
      showPanel("state-loading");
  
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const place = {
            name: "Tu ubicación",
            admin1: "",
            country: "",
            country_code: "",
            latitude,
            longitude,
          };
          await loadPlace(place);
        },
        (err) => {
          console.warn(err);
          // err.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
          const txt =
            err.code === 1
              ? "Diste permiso denegado. Buscá tu ciudad arriba."
              : "No pudimos obtener tu ubicación. Intenta buscar manualmente.";
          toast(txt);
          showPanel("state-empty");
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 10 * 60 * 1000, // 10 min de cache
        }
      );
    };
  
    /* --- 19. Toggle de unidades C/F ---------------------------- */
    const setUnit = (unit) => {
      state.unit = unit === "f" ? "f" : "c";
      writeJson(LS.UNIT, state.unit);
      // Actualizamos aria-pressed en los 2 botones
      $$(".units__btn").forEach((b) => {
        const active = b.dataset.unit === state.unit;
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      // Re-renderizamos si ya hay data cargada
      if (state.current) renderAll();
    };
  
    /* --- 20. Wiring de eventos --------------------------------- */
    const wire = () => {
      const input = $("#city-input");
  
      // Input: dispara autocomplete (debounced)
      input.addEventListener("input", onInput);
  
      // Focus: re-abre suggestions si ya habia resultados
      input.addEventListener("focus", () => {
        if (lastSuggestions.length > 0 && input.value.length >= 2) {
          openSuggestions();
        }
      });
  
      // Teclado: navegacion en la lista + Enter + Escape
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveSuggestion(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveSuggestion(-1);
        } else if (e.key === "Enter") {
          // Si hay item seleccionado, cargamos ese. Si no, cargamos el primero.
          if (activeSuggestion >= 0 && lastSuggestions[activeSuggestion]) {
            e.preventDefault();
            loadPlace(lastSuggestions[activeSuggestion]);
          } else if (lastSuggestions[0]) {
            e.preventDefault();
            loadPlace(lastSuggestions[0]);
          }
        } else if (e.key === "Escape") {
          closeSuggestions();
        }
      });
  
      // Botones de limpiar y cerrar afuera del search
      $("#search-clear").addEventListener("click", () => {
        input.value = "";
        $("#search-clear").hidden = true;
        closeSuggestions();
        input.focus();
      });
  
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".search__box")) closeSuggestions();
      });
  
      // Toggle de unidades
      $$(".units__btn").forEach((b) =>
        b.addEventListener("click", () => setUnit(b.dataset.unit))
      );
  
      // Geolocalizacion (dos botones, mismo handler)
      $("#geo-btn").addEventListener("click", useGeolocation);
      $("#geo-btn-empty").addEventListener("click", useGeolocation);
  
      // Retry (boton del error state)
      $("#retry-btn").addEventListener("click", () => {
        if (state.current) {
          loadPlace(state.current.place);
        } else {
          showPanel("state-empty");
        }
      });
    };
  
    /* --- 21. Boot ---------------------------------------------- */
    const boot = () => {
      setUnit(state.unit); // Hidratacion visual del toggle
      renderRecent(); // Pinta los chips antes del primer load
      wire();
  
      // Si hay recientes, cargamos la mas reciente automaticamente
      if (state.recent.length > 0) {
        loadPlace(state.recent[0]);
      } else {
        showPanel("state-empty");
      }
    };
  
    // Arrancar cuando el DOM este listo
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  })();