import { deriveKey, exportKeyToB64, importKeyFromB64, decryptBuffer, AuthError } from "./crypto.js";

const BUCKET = "https://storage.googleapis.com/market-share-503713-data";
const FILE = "bcg_matrix.json";
const SESSION_KEY = "bcg_dk";

const els = {
  gate: document.getElementById("gate"),
  gateForm: document.getElementById("gate-form"),
  password: document.getElementById("password"),
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
  togglePoli: document.getElementById("toggle-poli"),
  toggleMercado: document.getElementById("toggle-mercado"),
  tabla: document.getElementById("tabla-datos"),
  metaDatos: document.getElementById("meta-datos"),
  tabBtns: [...document.querySelectorAll(".tab-btn")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
};

let rows = [];
let chart = null;
let anios = [];
let expandido = { poli: false, mercado: false };

function pct(x) {
  return x == null ? "s/d" : `${(x * 100).toFixed(1)}%`;
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

function renderChart(segmentoActivo, sector) {
  const datos = rows
    .filter((r) => r.segmento === segmentoActivo)
    .map((r) => ({ r, m: r.por_sector[sector] }))
    .filter(({ m }) => m.share_mercado != null && m.crecimiento_mercado != null);

  const maxTamano = Math.max(1, ...datos.map(({ m }) => m.matriculas_mercado[String(rows[0]?.anio_base)] ?? 0));

  const puntos = datos.map(({ r, m }) => ({
    value: [m.share_mercado, m.crecimiento_mercado, m.matriculas_mercado[r.anio_base]],
    name: r.programa_academico,
    itemStyle: { color: "#0f385a" },
    raw: { r, m },
  }));

  chart.setOption(
    {
      grid: { left: 70, right: 30, top: 30, bottom: 60 },
      tooltip: {
        formatter: (p) => {
          const { r, m } = p.data.raw;
          return `<b>${r.programa_academico}</b><br/>
            Segmento: ${r.segmento} · Sector: ${sector}<br/>
            Cuota de mercado: ${pct(m.share_mercado)}<br/>
            Crecimiento mercado: ${pct(m.crecimiento_mercado)}<br/>
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
        },
      ],
    },
    true
  );

  els.meta.textContent = `${datos.length} programa(s) en "${segmentoActivo}" · sector ${sector} · año base ${rows[0]?.anio_base ?? "-"}`;
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
  return `<th class="border-b border-slate-100 px-2.5 py-2 text-left font-semibold text-slate-500 ${extraClass}">${text}</th>`;
}

function renderTabla() {
  actualizarToggleBtn(els.togglePoli, expandido.poli, "Histórico Poli");
  actualizarToggleBtn(els.toggleMercado, expandido.mercado, "Histórico Mercado");

  const sede = els.filtroSede.value;
  const nivel = els.filtroNivel.value;
  const sector = els.filtroSector.value;
  const datos = rows.filter((r) => (!sede || r.sede === sede) && (!nivel || r.nivel_academico === nivel));

  const aniosPoli = expandido.poli ? anios : [];
  const aniosMercado = expandido.mercado ? anios : [];

  const thead = `
    <thead class="sticky top-0 bg-slate-50">
      <tr>
        ${th("", "")}${th("", "")}${th("", "")}${th("", "")}
        <th colspan="${Math.max(aniosPoli.length, 1)}" class="border-b border-slate-100 bg-sky-50 px-2.5 py-1.5 text-center font-bold text-sky-700">Matrículas nuevas Poli</th>
        <th colspan="${Math.max(aniosMercado.length, 1)}" class="border-b border-slate-100 bg-slate-100 px-2.5 py-1.5 text-center font-bold text-slate-600">Matrículas nuevas mercado SNIES (${sector})</th>
        ${th("", "")}${th("", "")}${th("", "")}${th("", "")}
      </tr>
      <tr>
        ${th("SNIES")}${th("Programa Poli")}${th("Sede")}${th("Nivel")}
        ${aniosPoli.length ? aniosPoli.map((a) => th(a, "text-right bg-sky-50/60")).join("") : th("—", "text-right bg-sky-50/60 text-slate-300")}
        ${aniosMercado.length ? aniosMercado.map((a) => th(a, "text-right bg-slate-50")).join("") : th("—", "text-right bg-slate-50 text-slate-300")}
        ${th("Share Mercado", "text-right")}${th("Share Poli", "text-right")}
        ${th("Crecim. Mercado", "text-right")}${th("Crecim. Poli", "text-right")}
      </tr>
    </thead>`;

  const rowsHtml = datos
    .map((r) => {
      const m = r.por_sector[sector];
      const poliCells = aniosPoli.length
        ? aniosPoli.map((a) => `<td class="px-2.5 py-1.5 text-right text-slate-600">${num(r.matriculas_poli[a])}</td>`).join("")
        : `<td class="px-2.5 py-1.5 text-right text-slate-300">…</td>`;
      const mercadoCells = aniosMercado.length
        ? aniosMercado.map((a) => `<td class="px-2.5 py-1.5 text-right text-slate-400">${m.matriculas_mercado ? num(m.matriculas_mercado[a]) : "s/d"}</td>`).join("")
        : `<td class="px-2.5 py-1.5 text-right text-slate-300">…</td>`;
      return `<tr class="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/60">
        <td class="px-2.5 py-1.5 text-slate-400">${r.codigo_snies_programa}</td>
        <td class="px-2.5 py-1.5 font-medium text-slate-800">${r.programa_academico}</td>
        <td class="px-2.5 py-1.5 text-slate-500">${r.sede}</td>
        <td class="px-2.5 py-1.5 text-slate-500">${r.nivel_academico}</td>
        ${poliCells}
        ${mercadoCells}
        <td class="px-2.5 py-1.5 text-right font-medium text-slate-700">${pct(m.share_mercado)}</td>
        <td class="px-2.5 py-1.5 text-right font-medium text-slate-700">${pct(m.share_poli)}</td>
        <td class="px-2.5 py-1.5 text-right font-medium ${m.crecimiento_mercado < 0 ? "text-rose-600" : "text-emerald-600"}">${pct(m.crecimiento_mercado)}</td>
        <td class="px-2.5 py-1.5 text-right font-medium ${r.crecimiento_poli < 0 ? "text-rose-600" : "text-emerald-600"}">${pct(r.crecimiento_poli)}</td>
      </tr>`;
    })
    .join("");

  const totalPoliCells = aniosPoli.length
    ? aniosPoli.map((a) => `<td class="px-2.5 py-1.5 text-right text-sky-800">${num(datos.reduce((acc, r) => acc + Number(r.matriculas_poli[a] ?? 0), 0))}</td>`).join("")
    : `<td class="px-2.5 py-1.5 text-right text-slate-300">…</td>`;
  const totalMercadoCells = aniosMercado.length
    ? aniosMercado
        .map((a) => `<td class="px-2.5 py-1.5 text-right text-slate-700">${num(datos.reduce((acc, r) => acc + Number(r.por_sector[sector].matriculas_mercado?.[a] ?? 0), 0))}</td>`)
        .join("")
    : `<td class="px-2.5 py-1.5 text-right text-slate-300">…</td>`;
  const tfoot = `
    <tfoot>
      <tr class="border-t-2 border-slate-300 bg-slate-100 font-semibold">
        <td class="px-2.5 py-2" colspan="4">Subtotal (${datos.length} programa${datos.length === 1 ? "" : "s"})</td>
        ${totalPoliCells}
        ${totalMercadoCells}
        <td class="px-2.5 py-2" colspan="4"></td>
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
    rows = await fetchAndDecrypt(key);
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
