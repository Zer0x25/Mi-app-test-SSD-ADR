// ==============================================================================
// MEDIDORES APP CONTROLLER - ORQUESTACIÓN DE VISTA Y EVENTOS
// ADR 0002: Arquitectura del Frontend, Design System y Desacoplamiento de Lógica
// ==============================================================================

const OPERADOR_DEMO_ID = "a0000000-0000-0000-0000-000000000001";
let currentRole = "admin";
let instalacionesCache = [];
let tiposMedidorCache = [];
let medidoresOperadorCache = [];

// Inicialización del Ciclo de Vida
document.addEventListener("DOMContentLoaded", () => {
  inicializarApp();
});

async function inicializarApp() {
  await cargarSelectsGlobales();
  await cargarDashboard();
}

// ------------------------------------------------------------------------------
// 1. NAVEGACIÓN Y CONMUTACIÓN DE ROLES
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
// 2. DASHBOARD ADMINISTRATIVO (Auditoría & KPIs)
// ------------------------------------------------------------------------------
async function cargarDashboard() {
  try {
    // 1. KPIs
    const kpis = await window.api.dashboard.getKpis();
    document.getElementById("kpiTotalInstalaciones").innerText = kpis.totalInstalaciones;
    document.getElementById("kpiTotalMedidores").innerText = kpis.totalMedidores;
    document.getElementById("kpiTotalLecturas").innerText = kpis.totalLecturas;

    const pillsContainer = document.getElementById("kpiRecursosPills");
    pillsContainer.innerHTML = Object.entries(kpis.medidoresPorRecurso)
      .map(([rec, cant]) => `<span class="kpi-tag">${rec}: ${cant}</span>`)
      .join("");

    // 2. Medidores Desatendidos (+24h)
    const desatendidos = await window.api.dashboard.getDesatendidos(24);
    document.getElementById("kpiTotalDesatendidos").innerText = desatendidos.length;
    document.getElementById("badgeCountDesatendidos").innerText = `${desatendidos.length} pendientes`;

    const listDesatendidos = document.getElementById("listaDesatendidos");
    if (desatendidos.length === 0) {
      listDesatendidos.innerHTML = '<div class="empty-state">✅ Todos los medidores activos están al día (menos de 24h).</div>';
    } else {
      listDesatendidos.innerHTML = desatendidos
        .map((d) => window.Components.createDesatendidoItem(d))
        .join("");
    }

    // 3. Consumos Netos por Instalación
    const consumos = await window.api.dashboard.getConsumos();
    const consumosContainer = document.getElementById("listaConsumos");
    if (consumos.length === 0) {
      consumosContainer.innerHTML = '<div class="empty-state">No hay consumos acumulados registrados aún.</div>';
    } else {
      consumosContainer.innerHTML = consumos
        .map((c) => window.Components.createConsumoCard(c))
        .join("");
    }

    // 4. Actividad Reciente de Telemetría
    const lecturas = await window.api.lecturas.getRecientes(8);
    const lecturasContainer = document.getElementById("listaActividadReciente");
    if (lecturas.length === 0) {
      lecturasContainer.innerHTML = '<div class="empty-state">No hay mediciones recientes registradas.</div>';
    } else {
      lecturasContainer.innerHTML = lecturas
        .map((lec) => window.Components.createActivityItem(lec))
        .join("");
    }
  } catch (err) {
    console.error("Error al cargar dashboard:", err);
    window.Toast.error(err.message, "Fallo al sincronizar Dashboard");
  }
}

// ------------------------------------------------------------------------------
// 3. MODO OPERADOR (Captura en Terreno con Fichas de Medidor)
// ------------------------------------------------------------------------------
async function cargarSelectorOperador() {
  try {
    const instalaciones = await window.api.instalaciones.getByOperador(OPERADOR_DEMO_ID);
    const select = document.getElementById("selectOperadorInstalacion");
    select.innerHTML = '<option value="">-- Selecciona una Instalación Asignada --</option>';

    instalaciones.forEach((inst) => {
      const opt = document.createElement("option");
      opt.value = inst.id;
      opt.textContent = `${inst.nombre} (${inst.direccion})`;
      select.appendChild(opt);
    });

    if (instalaciones.length > 0) {
      select.value = instalaciones[0].id;
      cargarMedidoresInstalacion(instalaciones[0].id);
    } else {
      document.getElementById("gridMedidoresOperador").innerHTML =
        '<div class="empty-state">No tienes instalaciones asignadas para este turno.</div>';
    }
  } catch (err) {
    window.Toast.error(err.message, "Error al cargar instalaciones de operador");
  }
}

async function onOperadorInstalacionChange() {
  const select = document.getElementById("selectOperadorInstalacion");
  if (select.value) {
    await cargarMedidoresInstalacion(select.value);
  } else {
    document.getElementById("gridMedidoresOperador").innerHTML =
      '<div class="empty-state">Selecciona una instalación para ver los medidores a capturar.</div>';
  }
}

async function cargarMedidoresInstalacion(instalacionId) {
  try {
    const medidores = await window.api.medidores.getByInstalacion(instalacionId);
    medidoresOperadorCache = medidores;

    const grid = document.getElementById("gridMedidoresOperador");
    if (medidores.length === 0) {
      grid.innerHTML = '<div class="empty-state">No hay medidores físicos instalados en esta sede.</div>';
      return;
    }

    grid.innerHTML = medidores
      .map((m) => window.Components.createMeterCard(m))
      .join("");
  } catch (err) {
    window.Toast.error(err.message, "Error al cargar medidores");
  }
}

// ------------------------------------------------------------------------------
// 4. MODAL DE REGISTRO DE LECTURA (Captura en Terreno)
// ------------------------------------------------------------------------------
function openModalLectura(medidorId) {
  const medidor = medidoresOperadorCache.find((m) => m.id === medidorId);
  if (!medidor) return;

  const tipo = medidor.tipoMedidor || {};
  const meta = window.Components.getResourceMeta(tipo.recurso);

  document.getElementById("modalLecturaMedidorId").value = medidor.id;
  document.getElementById("modalLecturaCodigo").innerText = medidor.codigo;
  document.getElementById("modalLecturaTipo").innerText = `${tipo.nombre} (${tipo.recurso})`;
  document.getElementById("modalLecturaUbicacion").innerText = medidor.ubicacionInterna;
  document.getElementById("modalLecturaUnidad").innerText = tipo.unidadMedida || "";

  const valAnterior = medidor.ultimaLectura ? medidor.ultimaLectura.valor : null;
  document.getElementById("modalLecturaAnterior").innerText =
    valAnterior !== null ? `${window.Components.formatNumber(valAnterior)} ${tipo.unidadMedida}` : "Sin lectura previa";

  const inputValor = document.getElementById("modalLecturaInputValor");
  inputValor.value = "";
  inputValor.placeholder = valAnterior !== null ? `Mínimo ${valAnterior}` : "Ej. 1250.5";
  inputValor.step = "any";

  // Fecha y hora local predeterminada
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("modalLecturaInputFecha").value = now.toISOString().slice(0, 16);

  document.getElementById("modalLecturaObservaciones").value = "";

  window.Modal.open("modalLectura");
}

async function submitLectura(event) {
  event.preventDefault();

  const medidorId = document.getElementById("modalLecturaMedidorId").value;
  const valorRaw = document.getElementById("modalLecturaInputValor").value;
  const fechaRaw = document.getElementById("modalLecturaInputFecha").value;
  const obs = document.getElementById("modalLecturaObservaciones").value.trim();

  const valor = parseFloat(valorRaw);
  if (isNaN(valor)) {
    window.Toast.warning("Por favor ingresa un valor numérico válido.");
    return;
  }

  const payload = {
    medidorId,
    operadorId: OPERADOR_DEMO_ID,
    valor,
    timestamp: new Date(fechaRaw).toISOString(),
    observaciones: obs || undefined,
  };

  try {
    await window.api.lecturas.registrar(payload);
    window.Modal.close("modalLectura");
    window.Toast.success(`Lectura de ${valor} registrada exitosamente.`);

    // Recargar vista activa
    const select = document.getElementById("selectOperadorInstalacion");
    if (select.value) {
      await cargarMedidoresInstalacion(select.value);
    }
    if (currentRole === "admin") {
      await cargarDashboard();
    }
  } catch (err) {
    // Los errores tipados de dominio del backend se capturan limpiamente aquí
    window.Toast.error(err.message, "Validación Rechazada");
  }
}

// ------------------------------------------------------------------------------
// 5. MODALES ADMINISTRATIVOS (Altas de Catálogo)
// ------------------------------------------------------------------------------
async function cargarSelectsGlobales() {
  try {
    instalacionesCache = await window.api.instalaciones.getAll();
    tiposMedidorCache = await window.api.medidores.getTipos();

    // Select de instalación en Modal Nuevo Medidor
    const selInst = document.getElementById("selectMedidorInstalacion");
    if (selInst) {
      selInst.innerHTML = '<option value="">Selecciona instalación...</option>';
      instalacionesCache.forEach((i) => {
        selInst.innerHTML += `<option value="${i.id}">${i.nombre}</option>`;
      });
    }

    // Select de tipo en Modal Nuevo Medidor
    const selTipo = document.getElementById("selectMedidorTipo");
    if (selTipo) {
      selTipo.innerHTML = '<option value="">Selecciona tipo...</option>';
      tiposMedidorCache.forEach((t) => {
        selTipo.innerHTML += `<option value="${t.id}">${t.nombre} (${t.recurso} - ${t.unidadMedida})</option>`;
      });
    }
  } catch (err) {
    console.error("Error al cargar selects iniciales:", err);
  }
}

async function submitNuevaInstalacion(event) {
  event.preventDefault();
  const nombre = document.getElementById("inputInstalacionNombre").value.trim();
  const direccion = document.getElementById("inputInstalacionDireccion").value.trim();
  const descripcion = document.getElementById("inputInstalacionDesc").value.trim();

  try {
    await window.api.instalaciones.create({
      nombre,
      direccion,
      descripcion: descripcion || undefined,
    });

    window.Modal.close("modalInstalacion");
    event.target.reset();
    window.Toast.success(`Instalación «${nombre}» creada correctamente.`);
    await cargarSelectsGlobales();
    await cargarDashboard();
  } catch (err) {
    window.Toast.error(err.message, "Error al crear instalación");
  }
}

async function submitNuevoTipo(event) {
  event.preventDefault();
  const nombre = document.getElementById("inputTipoNombre").value.trim();
  const recurso = document.getElementById("selectTipoRecurso").value;
  const unidadMedida = document.getElementById("inputTipoUnidad").value.trim();
  const tipoMedicion = document.getElementById("selectTipoMedicion").value;
  const descripcion = document.getElementById("inputTipoDesc").value.trim();

  try {
    await window.api.medidores.createTipo({
      nombre,
      recurso,
      unidadMedida,
      tipoMedicion,
      descripcion: descripcion || undefined,
    });

    window.Modal.close("modalTipo");
    event.target.reset();
    window.Toast.success(`Tipo de medidor «${nombre}» creado.`);
    await cargarSelectsGlobales();
  } catch (err) {
    window.Toast.error(err.message, "Error al crear tipo");
  }
}

async function submitNuevoMedidor(event) {
  event.preventDefault();
  const instalacionId = document.getElementById("selectMedidorInstalacion").value;
  const tipoMedidorId = document.getElementById("selectMedidorTipo").value;
  const codigo = document.getElementById("inputMedidorCodigo").value.trim();
  const numeroSerie = document.getElementById("inputMedidorSerie").value.trim();
  const ubicacionInterna = document.getElementById("inputMedidorUbicacion").value.trim();

  try {
    await window.api.medidores.create({
      instalacionId,
      tipoMedidorId,
      codigo,
      numeroSerie: numeroSerie || undefined,
      ubicacionInterna,
    });

    window.Modal.close("modalMedidor");
    event.target.reset();
    window.Toast.success(`Medidor «${codigo}» dado de alta exitosamente.`);
    await cargarDashboard();
  } catch (err) {
    window.Toast.error(err.message, "Error al crear medidor");
  }
}

// ------------------------------------------------------------------------------
// 6. UTILIDAD DEMO
// ------------------------------------------------------------------------------
async function seedDemoData() {
  const btn = document.getElementById("btnSeedDemo");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Poblando base de datos...";

  try {
    const result = await window.api.demo.seed();
    window.Toast.success(result.message || "Datos demo poblados exitosamente.");
    await cargarSelectsGlobales();
    await cargarDashboard();
    if (currentRole === "operador") {
      await cargarSelectorOperador();
    }
  } catch (err) {
    window.Toast.error(err.message, "Error al cargar demo");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Enlace de utilidades globales para el DOM HTML
window.switchRole = switchRole;
window.openModal = (id) => window.Modal.open(id);
window.closeModal = (id) => window.Modal.close(id);
window.openModalLectura = openModalLectura;
window.submitLectura = submitLectura;
window.submitNuevaInstalacion = submitNuevaInstalacion;
window.submitNuevoTipo = submitNuevoTipo;
window.submitNuevoMedidor = submitNuevoMedidor;
window.seedDemoData = seedDemoData;
window.onOperadorInstalacionChange = onOperadorInstalacionChange;
