import { deriveKey, exportKeyToB64, importKeyFromB64, decryptBuffer, AuthError } from "./crypto.js";

const BUCKET = "https://storage.googleapis.com/market-share-503713-data";
const FILE = "bcg_matrix.json";
const SESSION_KEY = "bcg_dk";

const els = {
  gate: document.getElementById("gate"),
  gateForm: document.getElementById("gate-form"),
  password: document.getElementById("password"),
  togglePassword: document.getElementById("toggle-password"),
  gateError: document.getElementById("gate-error"),
  gateSubmit: document.getElementById("gate-submit"),
  app: document.getElementById("app"),
  segmento: document.getElementById("segmento"),
  sectorGraficos: document.getElementById("sector-graficos"),
  meta: document.getElementById("meta"),
  chart: document.getElementById("chart"),
  filtroSede: document.getElementById("filtro-sede"),
  filtroNivel: document.getElementById("filtro-nivel"),
  filtroSector: document.getElementById("filtro-sector"),
  filtroCuadrante: document.getElementById("filtro-cuadrante"),
  togglePoli: document.getElementById("toggle-poli"),
  toggleMercado: document.getElementById("toggle-mercado"),
  tabla: document.getElementById("tabla-datos"),
  metaDatos: document.getElementById("meta-datos"),
  tabBtns: [...document.querySelectorAll(".tab-btn")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
};

let rows = [];
let cortes = {};
let chart = null;
let anios = [];
let expandido = { poli: false, mercado: false };

const CUADRANTE_INFO = {
  Estrella: { icon: "⭐", label: "Estrella" },
  Interrogante: { icon: "❓", label: "Interrogante" },
  Vaca: { icon: "🐄", label: "Vaca" },
  Perro: { icon: "🐶", label: "Perro" },
};

function cuadranteTexto(cuadrante) {
  if (!cuadrante) return "s/d";
  const info = CUADRANTE_INFO[cuadrante];
  return `${info.icon} ${info.label}`;
}

function pct(x, topado = false) {
  if (x == null) return "s/d";
  return `${(x * 100).toFixed(1)}%${topado ? "*" : ""}`;
}

function num(x) {
  return x == null ? "s/d" : Number(x).toLocaleString("es-CO");
}

async function fetchAndDecrypt(key) {
  const res = await fetch(`${BUCKET}/${FILE}.enc?t=${Date.now()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${FILE}.enc`);
  const encrypted = await res.arrayBuffer();
  const plain = await decryptBuffer(key, encrypted);
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------- Tabs ----------

function activarTab(tab) {
  els.tabBtns.forEach((b) => b.classList.toggle("bg-white", b.dataset.tab === tab));
  els.tabBtns.forEach((b) => b.classList.toggle("shadow", b.dataset.tab === tab));
  els.tabPanels.forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
  if (tab === "graficos") chart?.resize();
}

els.tabBtns.forEach((b) => b.addEventListener("click", () => activarTab(b.dataset.tab)));

// ---------- Gráficos ----------

function etiquetaCuadrante(icon, label, left, top) {
  return {
    type: "text",
    left,
    top,
    style: { text: `${icon} ${label}`, fontSize: 13, fontWeight: "bold", fill: "#94a3b8" },
    z: 1,
  };
}

function renderChart(segmentoActivo, sector) {
  const datos = rows
    .filter((r) => r.segmento === segmentoActivo)
    .map((r) => ({ r, m: r.por_sector[sector] }))
    .filter(({ m }) => m.share_mercado != null && m.crecimiento_mercado != null);

  const maxTamano = Math.max(1, ...datos.map(({ m }) => m.matriculas_mercado[String(rows[0]?.anio_base)] ?? 0));
  const corte = cortes[segmentoActivo]?.[sector] ?? {};

  const puntos = datos.map(({ r, m }) => ({
    value: [m.share_mercado, m.crecimiento_mercado, m.matriculas_mercado[r.anio_base]],
    name: r.programa_academico,
    itemStyle: { color: "#0f385a" },
    raw: { r, m },
  }));

  chart.setOption(
    {
      grid: { left: 70, right: 30, top: 30, bottom: 60 },
      graphic: {
        elements: [
          etiquetaCuadrante("⭐", "Estrella", "13%", "6%"),
          etiquetaCuadrante("❓", "Interrogante", "78%", "6%"),
          etiquetaCuadrante("🐄", "Vaca", "13%", "88%"),
          etiquetaCuadrante("🐶", "Perro", "80%", "88%"),
        ],
      },
      tooltip: {
        formatter: (p) => {
          const { r, m } = p.data.raw;
          return `<b>${r.programa_academico}</b><br/>
            Segmento: ${r.segmento} · Sector: ${sector}<br/>
            Cuadrante: ${cuadranteTexto(m.cuadrante)}<br/>
            Cuota de mercado: ${pct(m.share_mercado)}<br/>
            Crecimiento mercado: ${pct(m.crecimiento_mercado, m.crecimiento_mercado_topado)}<br/>
            Matrículas mercado (${r.anio_base}): ${num(m.matriculas_mercado[r.anio_base])}<br/>
            Matrículas Poli (${r.anio_base}): ${num(r.matriculas_poli[r.anio_base])}<br/>
            Competidores homologados: ${num(m.num_competidores)}`;
        },
      },
      xAxis: {
        name: "Cuota de mercado (Alto ← → Bajo)",
        nameLocation: "middle",
        nameGap: 35,
        inverse: true,
        axisLabel: { formatter: (v) => pct(v) },
        splitLine: { show: true },
      },
      yAxis: {
        name: "Tasa de crecimiento de mercado",
        nameLocation: "middle",
        nameGap: 50,
        axisLabel: { formatter: (v) => pct(v) },
        splitLine: { show: true },
      },
      series: [
        {
          type: "scatter",
          data: puntos,
          symbolSize: (val) => 12 + 48 * Math.sqrt(val[2] / maxTamano),
          label: {
            show: true,
            formatter: (p) => p.data.name,
            position: "top",
            fontSize: 11,
            color: "#334155",
          },
          labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
          emphasis: { focus: "series" },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#94a3b8", type: "dashed", width: 1.5 },
            label: { show: false },
            data: [
              ...(corte.share_mediana != null ? [{ xAxis: corte.share_mediana }] : []),
              ...(corte.crecimiento_mediana != null ? [{ yAxis: corte.crecimiento_mediana }] : []),
            ],
          },
        },
      ],
    },
    true
  );

  const hayTopados = datos.some(({ m }) => m.crecimiento_mercado_topado);
  els.meta.textContent =
    `${datos.length} programa(s) en "${segmentoActivo}" · sector ${sector} · año base ${rows[0]?.anio_base ?? "-"}` +
    ` · líneas = mediana del segmento (crecimiento ${pct(corte.crecimiento_mediana)}, share ${pct(corte.share_mediana)})` +
    (hayTopados ? " · * crecimiento real mayor a 100%, mostrado como 100% para no distorsionar la escala" : "");
}

function rerenderChart() {
  renderChart(els.segmento.value, els.sectorGraficos.value);
}

els.segmento.addEventListener("change", rerenderChart);
els.sectorGraficos.addEventListener("change", rerenderChart);

// ---------- Datos ----------

els.filtroSede.addEventListener("change", renderTabla);
els.filtroNivel.addEventListener("change", renderTabla);
els.filtroSector.addEventListener("change", renderTabla);
els.filtroCuadrante.addEventListener("change", renderTabla);

function actualizarToggleBtn(btn, expandidoFlag, etiqueta) {
  btn.textContent = `${expandidoFlag ? "▾" : "▸"} ${etiqueta}`;
  btn.classList.toggle("bg-sky-100", expandidoFlag && btn === els.togglePoli);
  btn.classList.toggle("bg-slate-200", expandidoFlag && btn === els.toggleMercado);
}

els.togglePoli.addEventListener("click", () => {
  expandido.poli = !expandido.poli;
  renderTabla();
});
els.toggleMercado.addEventListener("click", () => {
  expandido.mercado = !expandido.mercado;
  renderTabla();
});

function th(text, extraClass = "") {
  return `<th class="overflow-hidden whitespace-normal border-b border-slate-100 px-1.5 py-1.5 text-left font-semibold leading-tight text-slate-500 ${extraClass}">${text}</th>`;
}

const COL_ANIO_COLAPSADO = 80;

function colgroup(aniosPoli, aniosMercado) {
  const col = (w) => `<col style="width:${w}px">`;
  const anioCols = (lista) => (lista.length ? lista.map(() => col(48)).join("") : col(COL_ANIO_COLAPSADO));
  return `<colgroup>
    ${col(46)}${col(210)}${col(56)}${col(56)}
    ${anioCols(aniosPoli)}
    ${anioCols(aniosMercado)}
    ${col(58)}${col(52)}${col(64)}${col(58)}${col(90)}${col(90)}
  </colgroup>`;
}

function renderTabla() {
  actualizarToggleBtn(els.togglePoli, expandido.poli, "Histórico Poli");
  actualizarToggleBtn(els.toggleMercado, expandido.mercado, "Histórico Mercado");

  const sede = els.filtroSede.value;
  const nivel = els.filtroNivel.value;
  const sector = els.filtroSector.value;
  const cuadrante = els.filtroCuadrante.value;
  const datos = rows.filter(
    (r) =>
      (!sede || r.sede === sede) &&
      (!nivel || r.nivel_academico === nivel) &&
      (!cuadrante || r.por_sector[sector].cuadrante === cuadrante)
  );

  const aniosPoli = expandido.poli ? anios : [];
  const aniosMercado = expandido.mercado ? anios : [];

  const thead = `
    ${colgroup(aniosPoli, aniosMercado)}
    <thead class="sticky top-0 bg-slate-50">
      <tr>
        ${th("", "")}${th("", "")}${th("", "")}${th("", "")}
        <th colspan="${Math.max(aniosPoli.length, 1)}" class="overflow-hidden whitespace-normal border-b border-slate-100 bg-sky-50 px-1 py-1.5 text-center font-bold leading-tight text-sky-700">${aniosPoli.length ? "Matrículas Poli" : "Poli"}</th>
        <th colspan="${Math.max(aniosMercado.length, 1)}" class="overflow-hidden whitespace-normal border-b border-slate-100 bg-slate-100 px-1 py-1.5 text-center font-bold leading-tight text-slate-600">${aniosMercado.length ? `Matrículas mercado (${sector})` : "Mercado"}</th>
        ${th("", "")}${th("", "")}${th("", "")}${th("", "")}${th("", "")}${th("", "")}
      </tr>
      <tr>
        ${th("SNIES")}${th("Programa Poli")}${th("Sede")}${th("Nivel")}
        ${aniosPoli.length ? aniosPoli.map((a) => th(a, "text-right bg-sky-50/60")).join("") : th("—", "text-right bg-sky-50/60 text-slate-300")}
        ${aniosMercado.length ? aniosMercado.map((a) => th(a, "text-right bg-slate-50")).join("") : th("—", "text-right bg-slate-50 text-slate-300")}
        ${th("Share Merc.", "text-right")}${th("Share Poli", "text-right")}
        ${th("Crec. Merc.", "text-right")}${th("Crec. Poli", "text-right")}${th("Result. Merc.")}${th("Result. Poli")}
      </tr>
    </thead>`;

  const rowsHtml = datos
    .map((r) => {
      const m = r.por_sector[sector];
      const poliCells = aniosPoli.length
        ? aniosPoli.map((a) => `<td class="px-1.5 py-1 text-right text-slate-600">${num(r.matriculas_poli[a])}</td>`).join("")
        : `<td class="px-1.5 py-1 text-right text-slate-300">…</td>`;
      const mercadoCells = aniosMercado.length
        ? aniosMercado.map((a) => `<td class="px-1.5 py-1 text-right text-slate-400">${m.matriculas_mercado ? num(m.matriculas_mercado[a]) : "s/d"}</td>`).join("")
        : `<td class="px-1.5 py-1 text-right text-slate-300">…</td>`;
      return `<tr class="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/60">
        <td class="truncate px-1.5 py-1 text-slate-400">${r.codigo_snies_programa}</td>
        <td class="truncate px-1.5 py-1 font-medium text-slate-800" title="${r.programa_academico}">${r.programa_academico}</td>
        <td class="truncate px-1.5 py-1 text-slate-500">${r.sede}</td>
        <td class="truncate px-1.5 py-1 text-slate-500">${r.nivel_academico}</td>
        ${poliCells}
        ${mercadoCells}
        <td class="px-1.5 py-1 text-right font-medium text-slate-700">${pct(m.share_mercado)}</td>
        <td class="px-1.5 py-1 text-right font-medium text-slate-700">${pct(m.share_poli)}</td>
        <td class="px-1.5 py-1 text-right font-medium ${m.crecimiento_mercado < 0 ? "text-rose-600" : "text-emerald-600"}">${pct(m.crecimiento_mercado, m.crecimiento_mercado_topado)}</td>
        <td class="px-1.5 py-1 text-right font-medium ${r.crecimiento_poli < 0 ? "text-rose-600" : "text-emerald-600"}">${pct(r.crecimiento_poli, r.crecimiento_poli_topado)}</td>
        <td class="truncate px-1.5 py-1 font-medium text-slate-700">${cuadranteTexto(m.cuadrante)}</td>
        <td class="truncate px-1.5 py-1 font-medium text-slate-700">${cuadranteTexto(m.cuadrante_poli)}</td>
      </tr>`;
    })
    .join("");

  const totalPoliCells = aniosPoli.length
    ? aniosPoli.map((a) => `<td class="px-1.5 py-1 text-right text-sky-800">${num(datos.reduce((acc, r) => acc + Number(r.matriculas_poli[a] ?? 0), 0))}</td>`).join("")
    : `<td class="px-1.5 py-1 text-right text-slate-300">…</td>`;
  const totalMercadoCells = aniosMercado.length
    ? aniosMercado
        .map((a) => `<td class="px-1.5 py-1 text-right text-slate-700">${num(datos.reduce((acc, r) => acc + Number(r.por_sector[sector].matriculas_mercado?.[a] ?? 0), 0))}</td>`)
        .join("")
    : `<td class="px-1.5 py-1 text-right text-slate-300">…</td>`;
  const totalColumnas = 4 + Math.max(aniosPoli.length, 1) + Math.max(aniosMercado.length, 1) + 6;
  const tfoot = `
    <tfoot>
      <tr class="border-t-2 border-slate-300 bg-slate-100 font-semibold">
        <td class="truncate px-1.5 py-1.5" colspan="4">Subtotal (${datos.length})</td>
        ${totalPoliCells}
        ${totalMercadoCells}
        <td class="px-1.5 py-1.5" colspan="6"></td>
      </tr>
      <tr>
        <td colspan="${totalColumnas}" class="px-1.5 py-1.5 text-[10px] font-normal italic text-slate-400">
          * Dato de mercado ajustado: se restaron 5.000 matrículas de 2025 al SNIES 107620 (Universidad Iberoamericana) por un valor atípico dentro de la competencia de "Maestría en Innovación Educativa" (grupo homólogo 110425, Posgrado Virtual) — reportaba 6.532 frente a un siguiente competidor más alto de 2.208.
        </td>
      </tr>
    </tfoot>`;

  els.tabla.innerHTML = thead + `<tbody>${rowsHtml}</tbody>` + tfoot;
  els.metaDatos.textContent = `${datos.length} de ${rows.length} programa(s) del portafolio · sector ${sector} · año base ${rows[0]?.anio_base ?? "-"}`;
}

// ---------- Arranque ----------

function showApp() {
  els.gate.classList.add("hidden");
  els.app.classList.remove("hidden");
  anios = rows[0]?.anios ?? [];
  chart = chart ?? echarts.init(els.chart);
  window.addEventListener("resize", () => chart.resize());
  activarTab("graficos");
  rerenderChart();
  renderTabla();
}

function showGateError(message) {
  els.gateError.textContent = message;
  els.gateError.classList.remove("hidden");
  els.gateSubmit.disabled = false;
  els.gateSubmit.textContent = "Entrar";
}

async function unlock(key) {
  try {
    const data = await fetchAndDecrypt(key);
    rows = data.rows;
    cortes = data.cortes;
  } catch (err) {
    if (err instanceof AuthError) {
      sessionStorage.removeItem(SESSION_KEY);
      showGateError("Contraseña incorrecta.");
      return;
    }
    showGateError("Error cargando los datos: " + err.message);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, await exportKeyToB64(key));
  showApp();
}

els.togglePassword.addEventListener("click", () => {
  const mostrando = els.password.type === "text";
  els.password.type = mostrando ? "password" : "text";
  els.togglePassword.textContent = mostrando ? "Mostrar" : "Ocultar";
});

els.gateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.gateError.classList.add("hidden");
  els.gateSubmit.disabled = true;
  els.gateSubmit.textContent = "Verificando…";
  const key = await deriveKey(els.password.value);
  await unlock(key);
});

(async function init() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return;
  try {
    const key = await importKeyFromB64(stored);
    await unlock(key);
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
})();
