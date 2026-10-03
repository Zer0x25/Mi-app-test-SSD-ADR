// ==============================================================================
// LÓGICA FRONTEND - SISTEMA MEDIDORES
// ==============================================================================

const OPERADOR_DEMO_ID = "a0000000-0000-0000-0000-000000000001";
let currentRole = "admin";
let instalacionesCache = [];
let tiposMedidorCache = [];
let medidoresOperadorCache = [];

document.addEventListener("DOMContentLoaded", () => {
  inicializarApp();
});

async function inicializarApp() {
  await cargarSelectsGlobales();
  await cargarDashboard();
}

// ------------------------------------------------------------------------------
// Navegación de Roles
// ------------------------------------------------------------------------------
function switchRole(role) {
  currentRole = role;
  const tabAdmin = document.getElementById("tabAdminBtn");
  const tabOperador = document.getElementById("tabOperadorBtn");
  const viewAdmin = document.getElementById("viewAdmin");
  const viewOperador = document.getElementById("viewOperador");

  if (role === "admin") {
    tabAdmin.classList.add("active");
    tabOperador.classList.remove("active");
    viewAdmin.classList.add("active");
    viewOperador.classList.remove("active");
    cargarDashboard();
  } else {
    tabOperador.classList.add("active");
    tabAdmin.classList.remove("active");
    viewOperador.classList.add("active");
    viewAdmin.classList.remove("active");
    cargarSelectorOperador();
  }
}

// ------------------------------------------------------------------------------
// Carga de Datos del Dashboard Admin
// ------------------------------------------------------------------------------
async function cargarDashboard() {
  try {
    // 1. KPIs
    const resKpis = await fetch("/api/dashboard/kpis");
    if (resKpis.ok) {
      const kpis = await resKpis.json();
      document.getElementById("kpiTotalInstalaciones").innerText = kpis.totalInstalaciones;
      document.getElementById("kpiTotalMedidores").innerText = kpis.totalMedidores;
      document.getElementById("kpiTotalLecturas").innerText = kpis.totalLecturas;

      // Pills de recursos
      const pillsContainer = document.getElementById("kpiRecursosPills");
      pillsContainer.innerHTML = Object.entries(kpis.medidoresPorRecurso)
        .map(([rec, cant]) => `<span class="kpi-tag">${rec}: ${cant}</span>`)
        .join("");
    }

    // 2. Medidores Desatendidos
    const resDesatendidos = await fetch("/api/dashboard/desatendidos?horas=24");
    if (resDesatendidos.ok) {
      const desatendidos = await resDesatendidos.json();
      document.getElementById("kpiTotalDesatendidos").innerText = desatendidos.length;
      document.getElementById("badgeCountDesatendidos").innerText = `${desatendidos.length} pendientes`;

      const listContainer = document.getElementById("listaDesatendidos");
      if (desatendidos.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">✅ Todos los medidores activos están al día (menos de 24h).</div>';
      } else {
        listContainer.innerHTML = desatendidos.map((d) => `
          <div class="desatendido-item">
            <div class="desatendido-info">
              <h4>${d.codigo}</h4>
              <p>${d.instalacionNombre} &bull; ${d.ubicacionInterna}</p>
            </div>
            <div class="desatendido-delay">
              ${d.horasSinLectura !== null ? `+${d.horasSinLectura}h sin lectura` : 'Sin lecturas registradas'}
            </div>
          </div>
        `).join("");
      }
    }

    // 3. Consumos Netos por Instalación
    const resConsumos = await fetch("/api/dashboard/consumos");
    if (resConsumos.ok) {
      const consumos = await resConsumos.json();
      const consumosContainer = document.getElementById("listaConsumos");
      if (consumos.length === 0) {
        consumosContainer.innerHTML = '<div class="empty-state">No hay consumos acumulados registrados aún.</div>';
      } else {
        consumosContainer.innerHTML = consumos.map((c) => `
          <div class="consumo-card">
            <span class="consumo-facility">${c.instalacionNombre}</span>
            <span class="consumo-resource">${c.recurso}</span>
            <span class="consumo-val">${c.consumoNeto.toLocaleString()} <small style="font-size:0.8rem">${c.unidad}</small></span>
            <span class="text-dim" style="font-size:0.75rem">${c.cantidadMedidores} medidores activos</span>
          </div>
        `).join("");
      }
    }

    // 4. Actividad Reciente
    const resActividad = await fetch("/api/dashboard/actividad-reciente?limit=8");
    if (resActividad.ok) {
      const actividad = await resActividad.json();
      const tbody = document.getElementById("tbodyActividad");
      if (actividad.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Aún no se registran mediciones.</td></tr>';
      } else {
        tbody.innerHTML = actividad.map((a) => `
          <tr>
            <td class="font-mono" style="font-weight:600">${a.medidorCodigo}</td>
            <td>${a.instalacionNombre}</td>
            <td><span class="badge badge-resource">${a.recurso}</span></td>
            <td style="font-weight:700; color:var(--accent-blue)">${a.valor.toLocaleString()} ${a.unidad}</td>
            <td style="color:var(--text-muted)">${new Date(a.fechaLectura).toLocaleString()}</td>
            <td style="font-size:0.8rem; color:var(--text-dim)">${a.operadorId.slice(0, 8)}...</td>
            <td style="font-style:italic; color:var(--text-muted)">${a.notas || '-'}</td>
          </tr>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Error al cargar dashboard:", err);
  }
}

// ------------------------------------------------------------------------------
// Modo Terreno (Operador)
// ------------------------------------------------------------------------------
async function cargarSelectorOperador() {
  const select = document.getElementById("selectInstalacionOperador");
  select.innerHTML = '<option value="">Cargando instalaciones asignadas...</option>';

  try {
    const res = await fetch(`/api/operadores/${OPERADOR_DEMO_ID}/instalaciones`);
    if (res.ok) {
      const instalaciones = await res.json();
      if (instalaciones.length === 0) {
        select.innerHTML = '<option value="">No tienes instalaciones asignadas</option>';
        document.getElementById("gridMedidoresOperador").innerHTML = `
          <div class="empty-state">
            <p>No tienes instalaciones asignadas actualmente.</p>
            <button class="btn btn-secondary mt-4" onclick="seedDemoData()">Cargar Datos Demo con Asignación</button>
          </div>
        `;
        return;
      }

      select.innerHTML = instalaciones.map((i) => `
        <option value="${i.id}">${i.nombre} (${i.ubicacion})</option>
      `).join("");

      cargarMedidoresOperador();
    }
  } catch (err) {
    console.error("Error al cargar instalaciones de operador:", err);
  }
}

async function cargarMedidoresOperador() {
  const select = document.getElementById("selectInstalacionOperador");
  const instalacionId = select.value;
  const grid = document.getElementById("gridMedidoresOperador");

  if (!instalacionId) {
    grid.innerHTML = '<div class="empty-state">Selecciona una instalación para listar medidores.</div>';
    return;
  }

  grid.innerHTML = '<div class="empty-state">Cargando medidores y últimas lecturas...</div>';

  try {
    const res = await fetch(`/api/instalaciones/${instalacionId}/medidores`);
    if (res.ok) {
      const medidores = await res.json();
      medidoresOperadorCache = medidores;

      if (medidores.length === 0) {
        grid.innerHTML = '<div class="empty-state">No hay medidores activos registrados en esta instalación.</div>';
        return;
      }

      // Obtener la última lectura de cada medidor en paralelo
      const medidoresConLectura = await Promise.all(
        medidores.map(async (m) => {
          const resUltima = await fetch(`/api/medidores/${m.id}/lecturas/ultima`);
          const ultima = resUltima.ok ? await resUltima.json() : null;
          return { ...m, ultimaLectura: ultima };
        })
      );

      grid.innerHTML = medidoresConLectura.map((m) => {
        const tipo = m.tipoMedidor || {};
        const valorLectura = m.ultimaLectura ? m.ultimaLectura.valor : 0;
        const fechaTexto = m.ultimaLectura 
          ? new Date(m.ultimaLectura.fechaLectura).toLocaleString()
          : 'Sin registro previo';

        return `
          <div class="meter-card" id="meterCard_${m.id}">
            <div class="meter-card-top">
              <div>
                <span class="meter-code">${m.codigo}</span>
                <p class="meter-location">${m.ubicacionInterna}</p>
              </div>
              <span class="badge badge-resource">${tipo.recurso || 'RECURSO'}</span>
            </div>

            <div class="meter-reading-box">
              <div>
                <span class="reading-meta">Último valor registrado:</span>
                <div class="reading-val">${valorLectura.toLocaleString()} <small style="font-size:0.9rem">${tipo.unidad || ''}</small></div>
              </div>
              <div class="reading-meta">${fechaTexto}</div>
            </div>

            <button class="btn btn-primary" onclick="abrirModalLectura('${m.id}')" style="width:100%; justify-content:center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              Ingresar Medición
            </button>
          </div>
        `;
      }).join("");
    }
  } catch (err) {
    console.error("Error al cargar medidores del operador:", err);
  }
}

// ------------------------------------------------------------------------------
// Modal e Ingreso de Lectura
// ------------------------------------------------------------------------------
function abrirModalLectura(medidorId) {
  const medidor = medidoresOperadorCache.find((m) => m.id === medidorId);
  if (!medidor) return;

  const tipo = medidor.tipoMedidor || {};
  const ultimoValor = medidor.ultimaLectura ? medidor.ultimaLectura.valor : 0;

  document.getElementById("lecturaMedidorId").value = medidor.id;
  document.getElementById("lecturaTipoMedicion").value = tipo.tipoMedicion || "ACUMULATIVO";
  document.getElementById("lecturaUltimoValor").value = ultimoValor;

  document.getElementById("modalLecturaTitulo").innerText = `Medición: ${medidor.codigo}`;
  document.getElementById("modalLecturaBadgeTipo").innerText = `${tipo.recurso || ''} · ${tipo.tipoMedicion || ''}`;
  document.getElementById("infoMedidorCodigo").innerText = medidor.codigo;
  document.getElementById("infoMedidorUbicacion").innerText = medidor.ubicacionInterna;
  document.getElementById("infoMedidorUltimaLectura").innerText = `${ultimoValor.toLocaleString()} ${tipo.unidad || ''}`;
  document.getElementById("spanUnidadMedida").innerText = tipo.unidad || '';

  const inputValor = document.getElementById("inputLecturaValor");
  inputValor.value = "";
  document.getElementById("inputLecturaNotas").value = "";
  document.getElementById("warningLecturaDecreciente").classList.remove("visible");

  openModal("modalLectura");
  setTimeout(() => inputValor.focus(), 100);
}

function validarLecturaEnVivo() {
  const tipoMedicion = document.getElementById("lecturaTipoMedicion").value;
  const ultimoValor = parseFloat(document.getElementById("lecturaUltimoValor").value) || 0;
  const nuevoValor = parseFloat(document.getElementById("inputLecturaValor").value);
  const warning = document.getElementById("warningLecturaDecreciente");
  const btnGuardar = document.getElementById("btnGuardarLectura");

  if (tipoMedicion === "ACUMULATIVO" && !isNaN(nuevoValor) && nuevoValor < ultimoValor) {
    warning.classList.add("visible");
    btnGuardar.disabled = true;
  } else {
    warning.classList.remove("visible");
    btnGuardar.disabled = false;
  }
}

async function submitLectura(e) {
  e.preventDefault();
  const medidorId = document.getElementById("lecturaMedidorId").value;
  const valor = parseFloat(document.getElementById("inputLecturaValor").value);
  const notas = document.getElementById("inputLecturaNotas").value;

  try {
    const res = await fetch("/api/lecturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        medidorId,
        operadorId: OPERADOR_DEMO_ID,
        valor,
        notas,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      showToast("✅ Medición guardada exitosamente con auditoría", "success");
      closeModal("modalLectura");
      cargarMedidoresOperador();
      cargarDashboard();
    } else {
      showToast(`❌ Error de Dominio: ${data.message || data.error}`, "error");
    }
  } catch (err) {
    showToast("Error de conexión al enviar la lectura", "error");
  }
}

// ------------------------------------------------------------------------------
// Formularios de Creación Admin
// ------------------------------------------------------------------------------
async function cargarSelectsGlobales() {
  try {
    // 1. Cargar Instalaciones
    const resInst = await fetch("/api/operadores/" + OPERADOR_DEMO_ID + "/instalaciones");
    // Fallback: listar instalaciones del medidor
    const resAllInst = await fetch("/api/dashboard/kpis");
    if (resAllInst.ok) {
      // También poblamos selects
      const resMed = await fetch("/api/tipos-medidor");
      if (resMed.ok) {
        tiposMedidorCache = await resMed.json();
        const selectTipo = document.getElementById("selectMedidorTipo");
        selectTipo.innerHTML = '<option value="">Selecciona tipo...</option>' + 
          tiposMedidorCache.map((t) => `<option value="${t.id}">${t.nombre} (${t.recurso} · ${t.unidad})</option>`).join("");
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function submitNuevaInstalacion(e) {
  e.preventDefault();
  const nombre = document.getElementById("inputInstalacionNombre").value;
  const ubicacion = document.getElementById("inputInstalacionUbicacion").value;

  try {
    const res = await fetch("/api/instalaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, ubicacion }),
    });
    const data = await res.json();
    if (res.ok) {
      // Auto-asignar al operador demo para que le aparezca
      await fetch(`/api/instalaciones/${data.id}/operadores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: OPERADOR_DEMO_ID }),
      });

      showToast(`✅ Instalación '${nombre}' creada y asignada al operador`, "success");
      closeModal("modalInstalacion");
      document.getElementById("formInstalacion").reset();
      cargarDashboard();
      cargarSelectorOperador();
    } else {
      showToast(`❌ ${data.message || data.error}`, "error");
    }
  } catch (err) {
    showToast("Error de conexión", "error");
  }
}

async function submitNuevoTipo(e) {
  e.preventDefault();
  const nombre = document.getElementById("inputTipoNombre").value;
  const recurso = document.getElementById("selectTipoRecurso").value;
  const unidad = document.getElementById("selectTipoUnidad").value;
  const tipoMedicion = document.getElementById("selectTipoModo").value;

  try {
    const res = await fetch("/api/tipos-medidor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, recurso, unidad, tipoMedicion }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ Tipo de medidor '${nombre}' configurado`, "success");
      closeModal("modalTipo");
      document.getElementById("formTipo").reset();
      cargarSelectsGlobales();
    } else {
      showToast(`❌ ${data.message || data.error}`, "error");
    }
  } catch (err) {
    showToast("Error de conexión", "error");
  }
}

async function submitNuevoMedidor(e) {
  e.preventDefault();
  const instalacionId = document.getElementById("selectMedidorInstalacion").value;
  const tipoMedidorId = document.getElementById("selectMedidorTipo").value;
  const codigo = document.getElementById("inputMedidorCodigo").value;
  const numeroSerie = document.getElementById("inputMedidorSerie").value;
  const ubicacionInterna = document.getElementById("inputMedidorUbicacion").value;

  try {
    const res = await fetch("/api/medidores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instalacionId,
        tipoMedidorId,
        codigo,
        numeroSerie: numeroSerie || undefined,
        ubicacionInterna,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ Medidor '${codigo}' registrado exitosamente`, "success");
      closeModal("modalMedidor");
      document.getElementById("formMedidor").reset();
      cargarDashboard();
      cargarMedidoresOperador();
    } else {
      showToast(`❌ ${data.message || data.error}`, "error");
    }
  } catch (err) {
    showToast("Error de conexión", "error");
  }
}

// ------------------------------------------------------------------------------
// Carga de Datos Demo
// ------------------------------------------------------------------------------
async function seedDemoData() {
  const btn = document.getElementById("btnSeedDemo");
  btn.disabled = true;
  btn.innerText = "Cargando...";

  try {
    const res = await fetch("/api/demo/seed", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      showToast("🚀 Datos de demostración listos (2 Sedes, 4 Tipos, 5 Medidores y Lecturas)", "success");
      await cargarDashboard();
      await cargarSelectorOperador();
      await cargarSelectsGlobales();
    } else {
      showToast(`❌ Error al sembrar datos: ${data.message}`, "error");
    }
  } catch (err) {
    showToast("Error de conexión al sembrar datos", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
      </svg>
      Cargar Datos Demo
    `;
  }
}

// ------------------------------------------------------------------------------
// Utilidades: Modales y Toasts
// ------------------------------------------------------------------------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    // Si es modal medidor, actualizar select de instalaciones
    if (id === "modalMedidor") {
      const selectInst = document.getElementById("selectMedidorInstalacion");
      const selectOp = document.getElementById("selectInstalacionOperador");
      selectInst.innerHTML = selectOp.innerHTML;
    }
    modal.classList.add("open");
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideInRight 0.3s reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
