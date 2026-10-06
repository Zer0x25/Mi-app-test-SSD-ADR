import {
  DashboardKpisResponse,
  MedidorDesatendido,
  ConsumoPorInstalacion,
  ActividadRecienteLectura,
} from "./dashboard.schema.js";

export interface RawInstalacion {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface RawMedidor {
  id: string;
  codigo: string;
  instalacionId: string;
  instalacionNombre: string;
  ubicacionInterna: string;
  recurso: string;
  unidad: string;
  tipoMedicion: string;
  activo: boolean;
}

export interface RawLectura {
  id: string;
  medidorId: string;
  valor: number;
  fechaLectura: Date;
  operadorId: string;
  notas?: string | null;
}

export interface DashboardRawData {
  instalaciones: RawInstalacion[];
  medidores: RawMedidor[];
  lecturas: RawLectura[];
}

export interface IDashboardRepository {
  getDashboardData(allowedInstalacionIds?: string[]): Promise<DashboardRawData>;
}

export class DashboardService {
  constructor(private readonly repository: IDashboardRepository) {}

  async obtenerKpis(allowedInstalacionIds?: string[]): Promise<DashboardKpisResponse> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);

    const instalacionesActivas = data.instalaciones.filter((i) => i.activa);
    const medidoresActivos = data.medidores.filter((m) => m.activo);

    const medidoresPorRecurso: Record<string, number> = {};
    for (const m of medidoresActivos) {
      medidoresPorRecurso[m.recurso] = (medidoresPorRecurso[m.recurso] || 0) + 1;
    }

    return {
      totalInstalaciones: instalacionesActivas.length,
      totalMedidores: medidoresActivos.length,
      medidoresPorRecurso,
      totalLecturas: data.lecturas.length,
    };
  }

  async obtenerMedidoresDesatendidos(horasUmbral = 24, allowedInstalacionIds?: string[]): Promise<MedidorDesatendido[]> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const medidoresActivos = data.medidores.filter((m) => m.activo);
    const now = Date.now();
    const umbralMs = horasUmbral * 3600 * 1000;

    const desatendidos: MedidorDesatendido[] = [];

    for (const m of medidoresActivos) {
      const lecturasMedidor = data.lecturas
        .filter((l) => l.medidorId === m.id)
        .sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());

      if (lecturasMedidor.length === 0) {
        desatendidos.push({
          medidorId: m.id,
          codigo: m.codigo,
          instalacionId: m.instalacionId,
          instalacionNombre: m.instalacionNombre,
          ubicacionInterna: m.ubicacionInterna,
          ultimaLecturaFecha: null,
          horasSinLectura: null,
        });
      } else {
        const ultima = lecturasMedidor[0];
        const diffMs = now - ultima.fechaLectura.getTime();
        if (diffMs >= umbralMs) {
          const horasSinLectura = Math.floor(diffMs / (3600 * 1000));
          desatendidos.push({
            medidorId: m.id,
            codigo: m.codigo,
            instalacionId: m.instalacionId,
            instalacionNombre: m.instalacionNombre,
            ubicacionInterna: m.ubicacionInterna,
            ultimaLecturaFecha: ultima.fechaLectura,
            horasSinLectura,
          });
        }
      }
    }

    return desatendidos;
  }

  async obtenerConsumoPorInstalacion(allowedInstalacionIds?: string[]): Promise<ConsumoPorInstalacion[]> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const medidoresActivos = data.medidores.filter((m) => m.activo);

    // Agrupar por clave: `${instalacionId}:${recurso}`
    const grupos = new Map<
      string,
      {
        instalacionId: string;
        instalacionNombre: string;
        recurso: string;
        unidad: string;
        medidores: RawMedidor[];
      }
    >();

    for (const m of medidoresActivos) {
      const key = `${m.instalacionId}:${m.recurso}`;
      const grupo = grupos.get(key) || {
        instalacionId: m.instalacionId,
        instalacionNombre: m.instalacionNombre,
        recurso: m.recurso,
        unidad: m.unidad,
        medidores: [],
      };
      grupo.medidores.push(m);
      grupos.set(key, grupo);
    }

    const resultado: ConsumoPorInstalacion[] = [];

    for (const grupo of grupos.values()) {
      let consumoNetoTotal = 0;

      for (const m of grupo.medidores) {
        if (m.tipoMedicion === "ACUMULATIVO") {
          const lecturas = data.lecturas
            .filter((l) => l.medidorId === m.id)
            .sort((a, b) => a.fechaLectura.getTime() - b.fechaLectura.getTime());

          if (lecturas.length >= 2) {
            const min = lecturas[0].valor;
            const max = lecturas[lecturas.length - 1].valor;
            consumoNetoTotal += max - min;
          }
        }
      }

      resultado.push({
        instalacionId: grupo.instalacionId,
        instalacionNombre: grupo.instalacionNombre,
        recurso: grupo.recurso,
        unidad: grupo.unidad,
        consumoNeto: consumoNetoTotal,
        cantidadMedidores: grupo.medidores.length,
      });
    }

    return resultado;
  }

  async obtenerActividadReciente(limit = 10, allowedInstalacionIds?: string[]): Promise<ActividadRecienteLectura[]> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const medidoresMap = new Map(data.medidores.map((m) => [m.id, m]));

    const ordenadas = [...data.lecturas].sort(
      (a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime()
    );

    const seleccionadas = ordenadas.slice(0, limit);

    return seleccionadas.map((l) => {
      const medidor = medidoresMap.get(l.medidorId);
      const unidad = medidor ? medidor.unidad : "OTRO";
      return {
        id: l.id,
        medidorId: l.medidorId,
        medidorCodigo: medidor ? medidor.codigo : "DESCONOCIDO",
        instalacionNombre: medidor ? medidor.instalacionNombre : "DESCONOCIDA",
        recurso: medidor ? medidor.recurso : "OTRO",
        unidad,
        unidadMedida: unidad,
        valor: l.valor,
        fechaLectura: l.fechaLectura,
        timestamp: l.fechaLectura,
        fecha: l.fechaLectura,
        operadorId: l.operadorId,
        notas: l.notas,
        observaciones: l.notas,
      };
    });
  }
}
