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
  meta: document.getElementById("meta"),
  chart: document.getElementById("chart"),
  slicerSede: document.getElementById("slicer-sede"),
  slicerNivel: document.getElementById("slicer-nivel"),
  tabla: document.getElementById("tabla-datos"),
  metaDatos: document.getElementById("meta-datos"),
  tabBtns: [...document.querySelectorAll(".tab-btn")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
};

let rows = [];
let chart = null;
let anios = [];
let filtros = { sede: new Set(), nivel: new Set() };

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

function renderChart(segmentoActivo) {
  const datos = rows.filter(
    (r) => r.segmento === segmentoActivo && r.share_mercado != null && r.crecimiento_mercado != null
  );
  const maxTamano = Math.max(1, ...datos.map((r) => r.matriculas_mercado[r.anio_base]));

  const puntos = datos.map((r) => ({
    value: [r.share_mercado, r.crecimiento_mercado, r.matriculas_mercado[r.anio_base]],
    name: r.programa_academico,
    itemStyle: { color: "#0f385a" },
    raw: r,
  }));

  chart.setOption(
    {
      grid: { left: 70, right: 30, top: 30, bottom: 60 },
      tooltip: {
        formatter: (p) => {
          const r = p.data.raw;
          return `<b>${r.programa_academico}</b><br/>
            Segmento: ${r.segmento}<br/>
            Cuota de mercado: ${pct(r.share_mercado)}<br/>
            Crecimiento mercado: ${pct(r.crecimiento_mercado)}<br/>
            Matrículas mercado (${r.anio_base}): ${num(r.matriculas_mercado[r.anio_base])}<br/>
            Matrículas Poli (${r.anio_base}): ${num(r.matriculas_poli[r.anio_base])}<br/>
            Competidores homologados: ${num(r.num_competidores)}`;
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

  els.meta.textContent = `${datos.length} programa(s) en "${segmentoActivo}" · año base ${datos[0]?.anio_base ?? "-"}`;
}

els.segmento.addEventListener("change", () => renderChart(els.segmento.value));

// ---------- Datos: filtros desplegables (estilo slicer de Excel) ----------

const dropdownPanels = [];

function construirDropdown(container, titulo, opciones, seleccionados) {
  container.innerHTML = "";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300";

  const panel = document.createElement("div");
  panel.className =
    "dropdown-panel absolute left-0 top-full z-10 mt-1 hidden w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg";

  function actualizarBoton() {
    btn.innerHTML = `${titulo} <span class="text-slate-400">(${seleccionados.size}/${opciones.length})</span> <span class="text-slate-400">▾</span>`;
  }

  opciones.forEach((op) => {
    const label = document.createElement("label");
    label.className = "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = seleccionados.has(op);
    chk.className = "accent-slate-900";
    chk.addEventListener("change", () => {
      if (chk.checked) seleccionados.add(op);
      else seleccionados.delete(op);
      actualizarBoton();
      renderTabla();
    });
    label.appendChild(chk);
    label.appendChild(document.createTextNode(op));
    panel.appendChild(label);
  });

  btn.addEventListener("click", () => {
    const abierto = !panel.classList.contains("hidden");
    dropdownPanels.forEach((p) => p.classList.add("hidden"));
    panel.classList.toggle("hidden", abierto);
  });

  actualizarBoton();
  container.appendChild(btn);
  container.appendChild(panel);
  dropdownPanels.push(panel);
}

document.addEventListener("click", (e) => {
  dropdownPanels.forEach((panel) => {
    if (!panel.parentElement.contains(e.target)) panel.classList.add("hidden");
  });
});

function construirSlicers() {
  const sedes = [...new Set(rows.map((r) => r.sede))].sort();
  const niveles = [...new Set(rows.map((r) => r.nivel_academico))].sort();
  filtros.sede = new Set(sedes);
  filtros.nivel = new Set(niveles);
  dropdownPanels.length = 0;

  construirDropdown(els.slicerSede, "Sede", sedes, filtros.sede);
  construirDropdown(els.slicerNivel, "Nivel", niveles, filtros.nivel);
}

function th(text, extraClass = "") {
  return `<th class="border-b border-slate-100 px-2.5 py-2 text-left font-semibold text-slate-500 ${extraClass}">${text}</th>`;
}

function renderTabla() {
  const datos = rows.filter((r) => filtros.sede.has(r.sede) && filtros.nivel.has(r.nivel_academico));

  const headYears1 = anios.map(() => "").join("");
  const thead = `
    <thead class="sticky top-0 bg-slate-50">
      <tr>
        ${th("", "")}${th("", "")}${th("", "")}${th("", "")}
        <th colspan="${anios.length}" class="border-b border-slate-100 bg-sky-50 px-2.5 py-1.5 text-center font-bold text-sky-700">Matrículas nuevas Poli</th>
        <th colspan="${anios.length}" class="border-b border-slate-100 bg-slate-100 px-2.5 py-1.5 text-center font-bold text-slate-600">Matrículas nuevas mercado SNIES</th>
        ${th("", "")}${th("", "")}${th("", "")}${th("", "")}
      </tr>
      <tr>
        ${th("SNIES")}${th("Programa Poli")}${th("Sede")}${th("Nivel")}
        ${anios.map((a) => th(a, "text-right bg-sky-50/60")).join("")}
        ${anios.map((a) => th(a, "text-right bg-slate-50")).join("")}
        ${th("Share Mercado", "text-right")}${th("Share Poli", "text-right")}
        ${th("Crecim. Mercado", "text-right")}${th("Crecim. Poli", "text-right")}
      </tr>
    </thead>`;

  const rowsHtml = datos
    .map((r) => {
      const poliCells = anios.map((a) => `<td class="px-2.5 py-1.5 text-right text-slate-600">${num(r.matriculas_poli[a])}</td>`).join("");
      const mercadoCells = anios
        .map((a) => `<td class="px-2.5 py-1.5 text-right text-slate-400">${r.matriculas_mercado ? num(r.matriculas_mercado[a]) : "s/d"}</td>`)
        .join("");
      return `<tr class="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/60">
        <td class="px-2.5 py-1.5 text-slate-400">${r.codigo_snies_programa}</td>
        <td class="px-2.5 py-1.5 font-medium text-slate-800">${r.programa_academico}</td>
        <td class="px-2.5 py-1.5 text-slate-500">${r.sede}</td>
        <td class="px-2.5 py-1.5 text-slate-500">${r.nivel_academico}</td>
        ${poliCells}
        ${mercadoCells}
        <td class="px-2.5 py-1.5 text-right font-medium text-slate-700">${pct(r.share_mercado)}</td>
        <td class="px-2.5 py-1.5 text-right font-medium text-slate-700">${pct(r.share_poli)}</td>
        <td class="px-2.5 py-1.5 text-right font-medium ${r.crecimiento_mercado < 0 ? "text-rose-600" : "text-emerald-600"}">${pct(r.crecimiento_mercado)}</td>
        <td class="px-2.5 py-1.5 text-right font-medium ${r.crecimiento_poli < 0 ? "text-rose-600" : "text-emerald-600"}">${pct(r.crecimiento_poli)}</td>
      </tr>`;
    })
    .join("");

  els.tabla.innerHTML = thead + `<tbody>${rowsHtml}</tbody>`;
  els.metaDatos.textContent = `${datos.length} de ${rows.length} programa(s) del portafolio · año base ${rows[0]?.anio_base ?? "-"}`;
}

// ---------- Arranque ----------

function showApp() {
  els.gate.classList.add("hidden");
  els.app.classList.remove("hidden");
  anios = rows[0]?.anios ?? [];
  chart = chart ?? echarts.init(els.chart);
  window.addEventListener("resize", () => chart.resize());
  activarTab("graficos");
  renderChart(els.segmento.value);
  construirSlicers();
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
