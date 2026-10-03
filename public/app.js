// ==============================================================================
// MEDIDORES APP CONTROLLER - ORQUESTACIÓN DE VISTA Y EVENTOS
// ADR 0002: Arquitectura del Frontend, Design System y Desacoplamiento de Lógica
// SPEC-005: Control de Acceso RBAC (Admin, Supervisor, Operador)
// ==============================================================================

let currentUser = null; // { id, email, nombre, rol }
let currentRoleTab = "admin";
let instalacionesCache = [];
let tiposMedidorCache = [];
let medidoresOperadorCache = [];

// Inicialización del Ciclo de Vida
document.addEventListener("DOMContentLoaded", () => {
  inicializarApp();
});

async function inicializarApp() {
  await sincronizarSesionUsuario();
  await cargarSelectsGlobales();
  if (currentUser?.rol === "OPERADOR") {
    switchRole("operador");
  } else {
    await cargarDashboard();
  }
}

// ------------------------------------------------------------------------------
// 1. GESTIÓN DE SESIÓN Y AUTENTICACIÓN (JWT & RBAC)
// ------------------------------------------------------------------------------
async function sincronizarSesionUsuario() {
  const token = window.api.getToken();
  if (token) {
    try {
      currentUser = await window.api.auth.me();
      aplicarPermisosUI();
      return;
    } catch {
      window.api.clearToken();
    }
  }

  // Si no hay sesión activa, autenticar por defecto con demo Admin
  try {
    const auth = await window.api.auth.login({
      email: "admin@medidores.cl",
      password: "demo1234",
    });
    currentUser = auth.usuario;
  } catch {
    currentUser = {
      id: "demo-admin-id",
      email: "admin@medidores.cl",
      nombre: "Administrador Central",
      rol: "ADMIN",
    };
  }
  aplicarPermisosUI();
}

/**
 * Conmuta rápidamente la sesión entre los 3 roles de prueba (ADMIN, SUPERVISOR, OPERADOR)
 */
async function loginComo(rol) {
  const creds = {
    ADMIN: { email: "admin@medidores.cl", pass: "demo1234" },
    SUPERVISOR: { email: "supervisor@medidores.cl", pass: "demo1234" },
    OPERADOR: { email: "operador@medidores.cl", pass: "demo1234" },
  }[rol];

  if (!creds) return;

  try {
    const res = await window.api.auth.login({
      email: creds.email,
      password: creds.pass,
    });
    currentUser = res.usuario;
    window.Toast.success(`Sesión iniciada como ${currentUser.nombre} (${currentUser.rol})`, "Autenticación");

    aplicarPermisosUI();

    // Actualizar vista según el nuevo rol
    if (currentUser.rol === "OPERADOR") {
      switchRole("operador");
    } else {
      switchRole("admin");
      await cargarDashboard();
    }
    await cargarSelectsGlobales();
  } catch (err) {
    window.Toast.error(err.message, "Fallo de Inicio de Sesión");
  }
}

/**
 * Aplica las reglas visuales estrictas según el Rol:
 * - ADMIN: acceso global, crear instalación, crear medidor, crear tipo.
 * - SUPERVISOR: NO puede crear instalaciones ni tipos; SÍ puede crear medidores en sedes asignadas.
 * - OPERADOR: solo ingreso en terreno; sin dashboard ni altas de medidor/instalación.
 */
function aplicarPermisosUI() {
  if (!currentUser) return;

  // 1. Navbar: Usuario activo y badge de rol y botón de cambio de clave
  const userPill = document.getElementById("navUserPill");
  if (userPill) {
    const roleBadgeClasses = {
      ADMIN: "badge-blue",
      SUPERVISOR: "badge-amber",
      OPERADOR: "badge-emerald",
    };
    userPill.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${currentUser.nombre}</span>
        <span class="badge ${roleBadgeClasses[currentUser.rol] || 'badge-muted'}">${currentUser.rol}</span>
        <button class="btn btn-outline btn-sm" onclick="openModal('modalCambiarPassword')" title="Cambiar mi contraseña" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
          🔑 Clave
        </button>
      </div>
    `;
  }

  // 2. Selectores de rol rápido en navbar
  const btnRoleAdmin = document.getElementById("quickRoleAdmin");
  const btnRoleSupervisor = document.getElementById("quickRoleSupervisor");
  const btnRoleOperador = document.getElementById("quickRoleOperador");

  if (btnRoleAdmin) btnRoleAdmin.classList.toggle("active", currentUser.rol === "ADMIN");
  if (btnRoleSupervisor) btnRoleSupervisor.classList.toggle("active", currentUser.rol === "SUPERVISOR");
  if (btnRoleOperador) btnRoleOperador.classList.toggle("active", currentUser.rol === "OPERADOR");

  // 3. Botones de acción del Dashboard
  const btnNuevaInstalacion = document.getElementById("btnOpenModalInstalacion");
  const btnNuevoTipo = document.getElementById("btnOpenModalTipo");
  const btnNuevoMedidor = document.getElementById("btnOpenModalMedidor");
  const tabAdminBtn = document.getElementById("tabAdminBtn");
  const tabUsuariosBtn = document.getElementById("tabUsuariosBtn");

  if (btnNuevaInstalacion) {
    // REGLA: Supervisor y Operador NO pueden crear instalaciones
    btnNuevaInstalacion.style.display = currentUser.rol === "ADMIN" ? "inline-flex" : "none";
  }

  if (btnNuevoTipo) {
    // REGLA: Solo ADMIN configura tipos de medidor
    btnNuevoTipo.style.display = currentUser.rol === "ADMIN" ? "inline-flex" : "none";
  }

  if (btnNuevoMedidor) {
    // REGLA: ADMIN y SUPERVISOR pueden crear medidores. OPERADOR no.
    btnNuevoMedidor.style.display = (currentUser.rol === "ADMIN" || currentUser.rol === "SUPERVISOR") ? "inline-flex" : "none";
  }

  if (tabAdminBtn) {
    // REGLA: OPERADOR no tiene acceso a Dashboard de auditoría
    tabAdminBtn.style.display = currentUser.rol === "OPERADOR" ? "none" : "inline-flex";
  }

  if (tabUsuariosBtn) {
    // REGLA: Solo ADMIN tiene acceso a Gestión de Usuarios
    tabUsuariosBtn.style.display = currentUser.rol === "ADMIN" ? "inline-flex" : "none";
  }
}

// ------------------------------------------------------------------------------
// 2. NAVEGACIÓN Y CONMUTACIÓN DE PESTAÑAS (VISTAS)
// ------------------------------------------------------------------------------
function switchRole(role) {
  if (role === "admin" && currentUser?.rol === "OPERADOR") {
    window.Toast.warning("El perfil OPERADOR solo tiene acceso al Modo Terreno.", "Permisos");
    return;
  }

  if (role === "usuarios" && currentUser?.rol !== "ADMIN") {
    window.Toast.warning("La gestión de usuarios está reservada para ADMIN.", "Permisos");
    return;
  }

  currentRoleTab = role;
  const tabAdmin = document.getElementById("tabAdminBtn");
  const tabUsuarios = document.getElementById("tabUsuariosBtn");
  const tabOperador = document.getElementById("tabOperadorBtn");
  const viewAdmin = document.getElementById("viewAdmin");
  const viewUsuarios = document.getElementById("viewUsuarios");
  const viewOperador = document.getElementById("viewOperador");

  [tabAdmin, tabUsuarios, tabOperador].forEach((t) => t?.classList.remove("active"));
  [viewAdmin, viewUsuarios, viewOperador].forEach((v) => v?.classList.remove("active"));

  if (role === "admin") {
    tabAdmin?.classList.add("active");
    viewAdmin?.classList.add("active");
    cargarDashboard();
  } else if (role === "usuarios") {
    tabUsuarios?.classList.add("active");
    viewUsuarios?.classList.add("active");
    cargarUsuariosAdmin();
  } else {
    tabOperador?.classList.add("active");
    viewOperador?.classList.add("active");
    cargarSelectorOperador();
  }
}

// ------------------------------------------------------------------------------
// 3. DASHBOARD ADMINISTRATIVO / SUPERVISOR
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
// 4. MODO OPERADOR / TERRENO
// ------------------------------------------------------------------------------
async function cargarSelectorOperador() {
  try {
    const userId = currentUser ? currentUser.id : "demo-user";
    let instalaciones = [];

    // Si es ADMIN, puede inspeccionar cualquier sede
    if (currentUser?.rol === "ADMIN") {
      instalaciones = await window.api.instalaciones.getAll();
    } else {
      // SUPERVISOR y OPERADOR solo ven sus instalaciones asignadas
      instalaciones = await window.api.instalaciones.getByOperador(userId);
    }

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
    window.Toast.error(err.message, "Error al cargar instalaciones asignadas");
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
// 5. REGISTRO DE LECTURAS (Captura en Terreno)
// ------------------------------------------------------------------------------
function openModalLectura(medidorId) {
  const medidor = medidoresOperadorCache.find((m) => m.id === medidorId);
  if (!medidor) return;

  const tipo = medidor.tipoMedidor || {};
  document.getElementById("modalLecturaMedidorId").value = medidor.id;
  document.getElementById("modalLecturaCodigo").innerText = medidor.codigo;
  document.getElementById("modalLecturaTipo").innerText = `${tipo.nombre} (${tipo.recurso})`;
  document.getElementById("modalLecturaUbicacion").innerText = medidor.ubicacionInterna;
  document.getElementById("modalLecturaUnidad").innerText = tipo.unidadMedida || tipo.unidad || "";

  const valAnterior = medidor.ultimaLectura ? medidor.ultimaLectura.valor : null;
  document.getElementById("modalLecturaAnterior").innerText =
    valAnterior !== null ? `${window.Components.formatNumber(valAnterior)} ${tipo.unidadMedida || tipo.unidad || ""}` : "Sin lectura previa";

  const inputValor = document.getElementById("modalLecturaInputValor");
  inputValor.value = "";
  inputValor.placeholder = valAnterior !== null ? `Mínimo ${valAnterior}` : "Ej. 1250.5";
  inputValor.step = "any";

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
    operadorId: currentUser ? currentUser.id : "demo-operator",
    valor,
    timestamp: new Date(fechaRaw).toISOString(),
    observaciones: obs || undefined,
  };

  try {
    await window.api.lecturas.registrar(payload);
    window.Modal.close("modalLectura");
    window.Toast.success(`Lectura de ${valor} registrada exitosamente.`);

    const select = document.getElementById("selectOperadorInstalacion");
    if (select.value) {
      await cargarMedidoresInstalacion(select.value);
    }
    if (currentRoleTab === "admin") {
      await cargarDashboard();
    }
  } catch (err) {
    window.Toast.error(err.message, "Validación Rechazada");
  }
}

// ------------------------------------------------------------------------------
// 6. ALTAS DE CATÁLOGO (Con Guardias de Permiso)
// ------------------------------------------------------------------------------
async function cargarSelectsGlobales() {
  try {
    // Si es SUPERVISOR, solo ve sus instalaciones asignadas en el dropdown de creación de medidor
    if (currentUser?.rol === "SUPERVISOR") {
      instalacionesCache = await window.api.instalaciones.getByOperador(currentUser.id);
    } else {
      instalacionesCache = await window.api.instalaciones.getAll();
    }

    tiposMedidorCache = await window.api.medidores.getTipos();

    const selInst = document.getElementById("selectMedidorInstalacion");
    if (selInst) {
      selInst.innerHTML = '<option value="">Selecciona instalación...</option>';
      instalacionesCache.forEach((i) => {
        selInst.innerHTML += `<option value="${i.id}">${i.nombre}</option>`;
      });
    }

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
  if (currentUser?.rol !== "ADMIN") {
    window.Toast.error("Operación prohibida: El rol SUPERVISOR no tiene permiso para crear instalaciones.", "Acceso Denegado");
    return;
  }

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
    // Si es un supervisor intentando crear en una instalación ajena, el backend retornará INSTALACION_NO_ASIGNADA
    window.Toast.error(err.message, "Permisos de Supervisor");
  }
}

// ------------------------------------------------------------------------------
// 7. UTILIDAD DEMO & SEED
// ------------------------------------------------------------------------------
async function seedDemoData() {
  const btn = document.getElementById("btnSeedDemo");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Poblando base de datos...";

  try {
    const result = await window.api.demo.seed();
    window.Toast.success(result.message || "Demostración poblada con éxito.");
    await sincronizarSesionUsuario();
    await cargarSelectsGlobales();
    await cargarDashboard();
    if (currentRoleTab === "operador") {
      await cargarSelectorOperador();
    }
  } catch (err) {
    window.Toast.error(err.message, "Error al cargar demo");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ------------------------------------------------------------------------------
// 8. GESTIÓN DE USUARIOS & CAMBIO DE CONTRASEÑA (SPEC-006)
// ------------------------------------------------------------------------------
let usuariosCache = [];

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function cargarUsuariosAdmin() {
  const tbody = document.getElementById("tbodyUsuarios");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Cargando directorio de usuarios...</td></tr>';

  try {
    const usuarios = await window.api.usuarios.getAll();
    usuariosCache = usuarios;

    if (usuarios.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay usuarios registrados.</td></tr>';
      return;
    }

    const roleBadgeClasses = {
      ADMIN: "badge-blue",
      SUPERVISOR: "badge-amber",
      OPERADOR: "badge-emerald",
    };

    tbody.innerHTML = usuarios
      .map((u) => {
        const instalacionesBadges = (u.instalaciones && u.instalaciones.length > 0)
          ? u.instalaciones
              .map(
                (i) =>
                  `<span class="badge badge-muted" style="margin-right: 0.25rem; margin-bottom: 0.25rem; font-size: 0.75rem;">🏢 ${escapeHtml(
                    i.nombre
                  )}</span>`
              )
              .join("")
          : u.rol === "ADMIN"
          ? '<span style="font-size: 0.75rem; color: var(--text-muted);">Acceso Global</span>'
          : '<span style="font-size: 0.75rem; color: var(--status-warning);">Sin sedes asignadas</span>';

        const estadoBadge = u.activo
          ? '<span class="badge badge-emerald">Activo</span>'
          : '<span class="badge badge-muted">Inactivo</span>';

        return `
          <tr>
            <td>
              <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(u.nombre)}</div>
            </td>
            <td class="font-mono" style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(u.email)}</td>
            <td>
              <span class="badge ${roleBadgeClasses[u.rol] || 'badge-muted'}">${u.rol}</span>
            </td>
            <td>${estadoBadge}</td>
            <td>${instalacionesBadges}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-outline btn-sm" onclick="abrirModalEditarUsuario('${u.id}')" title="Editar datos y sedes" style="margin-right: 0.35rem;">
                ✏️ Editar
              </button>
              <button class="btn btn-ghost btn-sm" onclick="abrirModalResetPassword('${u.id}')" title="Restablecer contraseña">
                🔄 Reset Clave
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color: var(--status-danger);">Error al cargar usuarios: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function submitCambiarPassword(event) {
  event.preventDefault();
  const passwordActual = document.getElementById("inputPasswordActual").value;
  const passwordNueva = document.getElementById("inputPasswordNueva").value;

  try {
    await window.api.auth.cambiarPassword({ passwordActual, passwordNueva });
    window.Toast.success("Contraseña actualizada exitosamente.", "Seguridad");
    document.getElementById("formCambiarPassword").reset();
    window.Modal.close("modalCambiarPassword");
  } catch (err) {
    window.Toast.error(err.message || "Error al actualizar contraseña", "Fallo");
  }
}

async function submitNuevoUsuario(event) {
  event.preventDefault();
  const nombre = document.getElementById("inputNuevoUsuarioNombre").value.trim();
  const email = document.getElementById("inputNuevoUsuarioEmail").value.trim();
  const password = document.getElementById("inputNuevoUsuarioPassword").value;
  const rol = document.getElementById("selectNuevoUsuarioRol").value;

  try {
    await window.api.usuarios.create({ nombre, email, password, rol });
    window.Toast.success(`Usuario «${nombre}» creado exitosamente.`, "Directorio");
    document.getElementById("formNuevoUsuario").reset();
    window.Modal.close("modalNuevoUsuario");
    await cargarUsuariosAdmin();
  } catch (err) {
    window.Toast.error(err.message || "Error al crear usuario", "Fallo");
  }
}

async function abrirModalEditarUsuario(usuarioId) {
  const usuario = usuariosCache.find((u) => u.id === usuarioId);
  if (!usuario) return;

  document.getElementById("editUsuarioId").value = usuario.id;
  document.getElementById("editUsuarioNombre").value = usuario.nombre;
  document.getElementById("editUsuarioRol").value = usuario.rol;
  document.getElementById("editUsuarioActivo").value = usuario.activo ? "true" : "false";

  // Checkboxes de instalaciones
  const listContainer = document.getElementById("editUsuarioInstalacionesList");
  const assignedIds = new Set((usuario.instalaciones || []).map((i) => i.id));

  listContainer.innerHTML = instalacionesCache
    .map(
      (inst) => `
      <label class="checklist-item">
        <input type="checkbox" name="editInstalacionCheck" value="${inst.id}" ${assignedIds.has(inst.id) ? "checked" : ""}>
        <span>${escapeHtml(inst.nombre)} <span style="font-size: 0.75rem; color: var(--text-muted);">(${escapeHtml(inst.ubicacion)})</span></span>
      </label>
    `
    )
    .join("");

  window.Modal.open("modalEditarUsuario");
}

async function submitEditarUsuario(event) {
  event.preventDefault();
  const id = document.getElementById("editUsuarioId").value;
  const nombre = document.getElementById("editUsuarioNombre").value.trim();
  const rol = document.getElementById("editUsuarioRol").value;
  const activo = document.getElementById("editUsuarioActivo").value === "true";

  const checkedCheckboxes = document.querySelectorAll('input[name="editInstalacionCheck"]:checked');
  const instalacionesIds = Array.from(checkedCheckboxes).map((cb) => cb.value);

  try {
    await window.api.usuarios.update(id, {
      nombre,
      rol,
      activo,
      instalacionesIds,
    });
    window.Toast.success("Usuario y asignaciones actualizados exitosamente.", "Directorio");
    window.Modal.close("modalEditarUsuario");
    await cargarUsuariosAdmin();

    if (currentUser?.id === id) {
      currentUser.nombre = nombre;
      currentUser.rol = rol;
      aplicarPermisosUI();
    }
  } catch (err) {
    window.Toast.error(err.message || "Error al actualizar usuario", "Fallo");
  }
}

function abrirModalResetPassword(usuarioId) {
  const usuario = usuariosCache.find((u) => u.id === usuarioId);
  if (!usuario) return;

  document.getElementById("resetUsuarioId").value = usuario.id;
  document.getElementById("resetUsuarioNombre").innerText = `${usuario.nombre} (${usuario.email})`;
  document.getElementById("formResetPassword").reset();
  window.Modal.open("modalResetPassword");
}

async function submitResetPassword(event) {
  event.preventDefault();
  const id = document.getElementById("resetUsuarioId").value;
  const passwordNueva = document.getElementById("resetPasswordNueva").value;

  try {
    await window.api.usuarios.resetPassword(id, { passwordNueva });
    window.Toast.success("Contraseña restablecida exitosamente.", "Seguridad");
    window.Modal.close("modalResetPassword");
  } catch (err) {
    window.Toast.error(err.message || "Error al restablecer contraseña", "Fallo");
  }
}

// Enlace global para el DOM HTML
window.switchRole = switchRole;
window.loginComo = loginComo;
window.openModal = (id) => window.Modal.open(id);
window.closeModal = (id) => window.Modal.close(id);
window.openModalLectura = openModalLectura;
window.submitLectura = submitLectura;
window.submitNuevaInstalacion = submitNuevaInstalacion;
window.submitNuevoTipo = submitNuevoTipo;
window.submitNuevoMedidor = submitNuevoMedidor;
window.seedDemoData = seedDemoData;
window.onOperadorInstalacionChange = onOperadorInstalacionChange;
window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.submitCambiarPassword = submitCambiarPassword;
window.submitNuevoUsuario = submitNuevoUsuario;
window.abrirModalEditarUsuario = abrirModalEditarUsuario;
window.submitEditarUsuario = submitEditarUsuario;
window.abrirModalResetPassword = abrirModalResetPassword;
window.submitResetPassword = submitResetPassword;

