/**
 * SyncManager - Gestor de Sincronización Resiliente Fuera de Línea (PWA / Offline-First)
 * Permite capturar lecturas en terreno sin cobertura, almacenarlas localmente y
 * sincronizarlas en lote con el backend al recuperar conectividad.
 */
class SyncManager {
  constructor() {
    this.storageKey = "medidores_offline_queue";
    this.isSyncing = false;
    this.onSyncCompleteCallbacks = [];
  }

  init() {
    // Registrar listeners de red
    window.addEventListener("online", () => {
      this.actualizarUI();
      if (window.Toast) {
        window.Toast.info("Conexión a internet restablecida. Iniciando sincronización...", "Conectado");
      }
      this.sincronizar();
    });

    window.addEventListener("offline", () => {
      this.actualizarUI();
      if (window.Toast) {
        window.Toast.warning("Sin conexión de red. Las lecturas se guardarán localmente.", "Modo Desconectado");
      }
    });

    // Registrar Service Worker si el navegador lo soporta
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service Worker registrado con éxito en ámbito:", reg.scope);
          })
          .catch((err) => {
            console.warn("[PWA] No se pudo registrar Service Worker:", err);
          });
      });
    }

    // Actualización inicial de la interfaz
    this.actualizarUI();

    // Si al iniciar estamos en línea y hay pendientes, sincronizar
    if (this.isOnline() && this.contarPendientes() > 0) {
      setTimeout(() => this.sincronizar(), 1500);
    }
  }

  isOnline() {
    return navigator.onLine;
  }

  onSyncComplete(callback) {
    if (typeof callback === "function") {
      this.onSyncCompleteCallbacks.push(callback);
    }
  }

  obtenerCola() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  guardarCola(cola) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(cola));
      this.actualizarUI();
    } catch (err) {
      console.error("[SyncManager] Error guardando cola en localStorage:", err);
    }
  }

  contarPendientes() {
    const cola = this.obtenerCola();
    return cola.filter((item) => item.status !== "SYNCED").length;
  }

  encolarLectura(payload, medidorEtiqueta = "") {
    const localId = `offline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nuevoItem = {
      localId,
      medidorId: payload.medidorId,
      medidorEtiqueta: medidorEtiqueta || payload.medidorId,
      operadorId: payload.operadorId,
      valor: payload.valor,
      fechaLectura: payload.fechaLectura || payload.timestamp || new Date().toISOString(),
      notas: payload.notas || payload.observaciones || "",
      status: "PENDING",
      timestampGuardado: new Date().toISOString(),
      intentos: 0,
    };

    const cola = this.obtenerCola();
    cola.push(nuevoItem);
    this.guardarCola(cola);

    return nuevoItem;
  }

  async sincronizar() {
    if (this.isSyncing) return;
    if (!this.isOnline()) {
      if (window.Toast) {
        window.Toast.warning("No hay conexión a internet para sincronizar.");
      }
      return;
    }

    let cola = this.obtenerCola();
    const pendientes = cola.filter((item) => item.status !== "SYNCED");
    if (pendientes.length === 0) {
      return;
    }

    this.isSyncing = true;
    this.actualizarUI();

    try {
      const payloadBatch = {
        lecturas: pendientes.map((item) => ({
          localId: item.localId,
          medidorId: item.medidorId,
          operadorId: item.operadorId,
          valor: item.valor,
          fechaLectura: item.fechaLectura,
          notas: item.notas || undefined,
        })),
      };

      const res = await window.api.lecturas.sincronizarLote(payloadBatch);

      // Procesar resultados del lote
      const mapResultados = new Map(res.results.map((r) => [r.localId, r]));

      cola = cola.filter((item) => {
        const resultado = mapResultados.get(item.localId);
        if (resultado && resultado.status === "SYNCED") {
          // Remover de la cola local porque ya está en base de datos
          return false;
        }
        if (resultado && resultado.status === "REJECTED") {
          item.status = "REJECTED";
          item.errorMsg = resultado.error?.message || "Rechazado por validación";
          item.intentos = (item.intentos || 0) + 1;
        }
        return true;
      });

      this.guardarCola(cola);

      if (window.Toast) {
        if (res.syncedCount > 0 && res.rejectedCount === 0) {
          window.Toast.success(`Sincronización completa: ${res.syncedCount} lectura(s) registradas en el servidor.`);
        } else if (res.syncedCount > 0 && res.rejectedCount > 0) {
          window.Toast.warning(`${res.syncedCount} sincronizadas, ${res.rejectedCount} rechazada(s) por validación.`);
        } else if (res.rejectedCount > 0) {
          window.Toast.error(`${res.rejectedCount} lectura(s) no pudieron sincronizarse.`);
        }
      }

      // Notificar a observadores para refrescar pantallas
      this.onSyncCompleteCallbacks.forEach((cb) => {
        try {
          cb(res);
        } catch (e) {
          console.error("[SyncManager] Error en callback de sincronización:", e);
        }
      });
    } catch (err) {
      console.warn("[SyncManager] Error de red al sincronizar lote:", err);
      if (window.Toast) {
        window.Toast.error("Fallo temporal de conexión al sincronizar lote.");
      }
    } finally {
      this.isSyncing = false;
      this.actualizarUI();
    }
  }

  descartarRechazadas() {
    let cola = this.obtenerCola();
    cola = cola.filter((item) => item.status !== "REJECTED");
    this.guardarCola(cola);
    if (window.Toast) {
      window.Toast.info("Lecturas rechazadas descartadas de la cola.");
    }
  }

  actualizarUI() {
    // 1. Badge de conectividad
    const badgeRed = document.getElementById("networkStatusBadge");
    if (badgeRed) {
      if (this.isOnline()) {
        badgeRed.className = "network-badge online";
        badgeRed.innerHTML = `<span class="network-dot"></span><span>En línea</span>`;
        badgeRed.title = "Conexión activa con el servidor";
      } else {
        badgeRed.className = "network-badge offline";
        badgeRed.innerHTML = `<span class="network-dot"></span><span>Modo Offline</span>`;
        badgeRed.title = "Sin conexión: las lecturas se guardan localmente";
      }
    }

    // 2. Botón / Badge de pendientes
    const btnSync = document.getElementById("syncQueueBtn");
    const badgePendientes = document.getElementById("syncQueueCount");
    const count = this.contarPendientes();

    if (btnSync && badgePendientes) {
      if (count > 0) {
        btnSync.style.display = "inline-flex";
        badgePendientes.textContent = count;
        if (this.isSyncing) {
          btnSync.classList.add("loading");
          btnSync.setAttribute("disabled", "true");
        } else {
          btnSync.classList.remove("loading");
          btnSync.removeAttribute("disabled");
        }
      } else {
        btnSync.style.display = "none";
      }
    }
  }
}

// Exportar singleton global para el frontend
window.syncManager = new SyncManager();
