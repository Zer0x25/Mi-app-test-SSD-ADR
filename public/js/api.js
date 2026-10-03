// ==============================================================================
// MEDIDORES API CLIENT - CAPA DE TRANSPORTE CENTRALIZADA
// ADR 0002: Arquitectura del Frontend, Design System y Desacoplamiento de Lógica
// ==============================================================================

class ApiError extends Error {
  constructor(status, message, code = "API_ERROR", details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem("medidores_auth_token") || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem("medidores_auth_token", token);
    } else {
      localStorage.removeItem("medidores_auth_token");
    }
  }

  getToken() {
    return this.token;
  }

  clearToken() {
    this.setToken(null);
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const errorMessage = (typeof data === "object" && data.message) ? data.message : `Error HTTP ${response.status}`;
        const errorCode = (typeof data === "object" && data.code) ? data.code : `HTTP_${response.status}`;
        throw new ApiError(response.status, errorMessage, errorCode, data);
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError(0, err.message || "Error de conexión con el servidor", "NETWORK_ERROR");
    }
  }

  // --- Dominio: Autenticación & RBAC ---
  auth = {
    login: async (credentials) => {
      const res = await this.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      if (res.token) {
        this.setToken(res.token);
      }
      return res;
    },
    register: (payload) =>
      this.request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    me: () => this.request("/api/auth/me"),
    cambiarPassword: (payload) =>
      this.request("/api/auth/cambiar-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    logout: () => {
      this.clearToken();
    },
  };

  // --- Dominio: Gestión de Usuarios & Roles (Admin) ---
  usuarios = {
    getAll: () => this.request("/api/usuarios"),
    create: (payload) =>
      this.request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      this.request(`/api/usuarios/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    resetPassword: (id, payload) =>
      this.request(`/api/usuarios/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };

  // --- Dominio: Dashboard & Métricas ---
  dashboard = {
    getKpis: () => this.request("/api/dashboard/kpis"),
    getDesatendidos: (horas = 24) => this.request(`/api/dashboard/desatendidos?horas=${horas}`),
    getConsumos: () => this.request("/api/dashboard/consumos"),
    getActividadReciente: (limit = 10) => this.request(`/api/dashboard/actividad-reciente?limit=${limit}`),
  };

  // --- Dominio: Lecturas & Telemetría ---
  lecturas = {
    getRecientes: (limit = 8) => this.request(`/api/dashboard/actividad-reciente?limit=${limit}`),
    registrar: (payload) =>
      this.request("/api/lecturas", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    sincronizarLote: (payload) =>
      this.request("/api/lecturas/batch-sync", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };

  // --- Dominio: Instalaciones ---
  instalaciones = {
    getAll: () => this.request("/api/instalaciones"),
    create: (payload) =>
      this.request("/api/instalaciones", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getByOperador: (operadorId) => this.request(`/api/instalaciones/operador/${operadorId}`),
  };

  // --- Dominio: Medidores & Tipos ---
  medidores = {
    getTipos: () => this.request("/api/medidores/tipos"),
    createTipo: (payload) =>
      this.request("/api/medidores/tipos", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getByInstalacion: (instalacionId) => this.request(`/api/medidores?instalacionId=${encodeURIComponent(instalacionId)}`),
    create: (payload) =>
      this.request("/api/medidores", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };

  // --- Utilidades Demo ---
  demo = {
    seed: () =>
      this.request("/api/demo/seed", {
        method: "POST",
        body: JSON.stringify({}),
      }),
  };

  // --- Dominio: Reportes & Conciliación (feat-007) ---
  reportes = {
    getConsumos: (params = {}) => {
      const q = new URLSearchParams();
      if (params.instalacionId) q.append("instalacionId", params.instalacionId);
      if (params.medidorId) q.append("medidorId", params.medidorId);
      if (params.recurso) q.append("recurso", params.recurso);
      if (params.fechaInicio) q.append("fechaInicio", params.fechaInicio);
      if (params.fechaFin) q.append("fechaFin", params.fechaFin);
      return this.request(`/api/reportes/consumos?${q.toString()}`);
    },
    getCsvUrl: (params = {}) => {
      const q = new URLSearchParams();
      if (params.instalacionId) q.append("instalacionId", params.instalacionId);
      if (params.medidorId) q.append("medidorId", params.medidorId);
      if (params.recurso) q.append("recurso", params.recurso);
      if (params.fechaInicio) q.append("fechaInicio", params.fechaInicio);
      if (params.fechaFin) q.append("fechaFin", params.fechaFin);
      return `/api/reportes/consumos/exportar-csv?${q.toString()}`;
    },
    registrarFactura: (payload) =>
      this.request("/api/reportes/facturas", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getFacturas: (instalacionId = null) => {
      const q = instalacionId ? `?instalacionId=${encodeURIComponent(instalacionId)}` : "";
      return this.request(`/api/reportes/facturas${q}`);
    },
  };

  // --- Dominio: Alertas Automáticas & Incidentes (feat-008) ---
  alertas = {
    getIncidentes: (params = {}) => {
      const q = new URLSearchParams();
      if (params.instalacionId) q.append("instalacionId", params.instalacionId);
      if (params.estado) q.append("estado", params.estado);
      if (params.severidad) q.append("severidad", params.severidad);
      if (params.tipo) q.append("tipo", params.tipo);
      return this.request(`/api/alertas/incidentes?${q.toString()}`);
    },
    resolverIncidente: (id, payload) =>
      this.request(`/api/alertas/incidentes/${encodeURIComponent(id)}/resolver`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    evaluar: () =>
      this.request("/api/alertas/evaluar", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    getResumen: (instalacionId = null) => {
      const q = instalacionId ? `?instalacionId=${encodeURIComponent(instalacionId)}` : "";
      return this.request(`/api/alertas/resumen${q}`);
    },
    getReglas: () => this.request("/api/alertas/reglas"),
    createRegla: (payload) =>
      this.request("/api/alertas/reglas", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };

  // --- Dominio: Mantenimiento & Calibración (feat-009) ---
  mantenimiento = {
    registrar: (payload) =>
      this.request("/api/mantenimiento", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getAll: (params = {}) => {
      const q = new URLSearchParams();
      if (params.instalacionId) q.append("instalacionId", params.instalacionId);
      if (params.medidorId) q.append("medidorId", params.medidorId);
      if (params.tipo) q.append("tipo", params.tipo);
      return this.request(`/api/mantenimiento?${q.toString()}`);
    },
    getFichaMedidor: (id) =>
      this.request(`/api/mantenimiento/medidor/${encodeURIComponent(id)}`),
  };

  // --- Dominio: Auditoría & Trazabilidad (feat-011) ---
  auditoria = {
    getEventos: (params = {}) => {
      const q = new URLSearchParams();
      if (params.accion) q.append("accion", params.accion);
      if (params.entidad) q.append("entidad", params.entidad);
      if (params.usuarioId) q.append("usuarioId", params.usuarioId);
      if (params.limit) q.append("limit", String(params.limit));
      return this.request(`/api/auditoria?${q.toString()}`);
    },
  };

  // --- Dominio: Webhooks & Integraciones (feat-012) ---
  webhooks = {
    getAll: () => this.request("/api/webhooks"),
    getById: (id) => this.request(`/api/webhooks/${encodeURIComponent(id)}`),
    create: (payload) =>
      this.request("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      this.request(`/api/webhooks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    delete: (id) =>
      this.request(`/api/webhooks/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    test: (id, payload = {}) =>
      this.request(`/api/webhooks/${encodeURIComponent(id)}/test`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getEntregas: (id, limit = 50) =>
      this.request(`/api/webhooks/${encodeURIComponent(id)}/entregas?limit=${limit}`),
    checkCalibraciones: () =>
      this.request("/api/webhooks/check-calibraciones", {
        method: "POST",
        body: JSON.stringify({}),
      }),
  };
}

// Instancia global unificada
window.api = new ApiClient();
