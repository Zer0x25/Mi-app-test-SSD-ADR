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
      "Content-Type": "application/json",
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

  // --- Dominio: Dashboard & Métricas ---
  dashboard = {
    getKpis: () => this.request("/api/dashboard/kpis"),
    getDesatendidos: (horas = 24) => this.request(`/api/dashboard/desatendidos?horas=${horas}`),
    getConsumos: () => this.request("/api/dashboard/consumos"),
  };

  // --- Dominio: Lecturas & Telemetría ---
  lecturas = {
    getRecientes: (limit = 8) => this.request(`/api/lecturas/recientes?limit=${limit}`),
    registrar: (payload) =>
      this.request("/api/lecturas", {
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
      }),
  };
}

// Instancia global unificada
window.api = new ApiClient();
