import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuditoriaService,
  IAuditoriaRepository,
  AuditoriaEntity,
} from "../../../src/modules/auditoria/auditoria.service.js";

describe("AuditoriaService Unit Suite", () => {
  let mockRepo: IAuditoriaRepository;
  let service: AuditoriaService;

  const fakeId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const fakeUserId = "11111111-2222-3333-4444-555555555555";

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      list: vi.fn(),
    };
    service = new AuditoriaService(mockRepo);
  });

  describe("registrarEvento", () => {
    it("debe registrar exitosamente un evento de auditoría append-only", async () => {
      const now = new Date();
      const fakeEntity: AuditoriaEntity = {
        id: fakeId,
        usuarioId: fakeUserId,
        accion: "CAMBIO_ROL",
        entidad: "USUARIO",
        entidadId: fakeUserId,
        detalles: JSON.stringify({ rolAnterior: "OPERADOR", rolNuevo: "SUPERVISOR" }),
        ip: "127.0.0.1",
        createdAt: now,
      };

      vi.mocked(mockRepo.create).mockResolvedValue(fakeEntity);

      const res = await service.registrarEvento({
        usuarioId: fakeUserId,
        accion: "CAMBIO_ROL",
        entidad: "USUARIO",
        entidadId: fakeUserId,
        detalles: { rolAnterior: "OPERADOR", rolNuevo: "SUPERVISOR" },
        ip: "127.0.0.1",
      });

      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      expect(mockRepo.create).toHaveBeenCalledWith({
        usuarioId: fakeUserId,
        accion: "CAMBIO_ROL",
        entidad: "USUARIO",
        entidadId: fakeUserId,
        detalles: JSON.stringify({ rolAnterior: "OPERADOR", rolNuevo: "SUPERVISOR" }),
        ip: "127.0.0.1",
      });
      expect(res.id).toBe(fakeId);
      expect(res.accion).toBe("CAMBIO_ROL");
      expect(res.detalles).toEqual({ rolAnterior: "OPERADOR", rolNuevo: "SUPERVISOR" });
    });

    it("debe rechazar eventos con acción no catalogada", async () => {
      await expect(
        service.registrarEvento({
          usuarioId: fakeUserId,
          // @ts-expect-error probando rechazo de acción inválida
          accion: "ACCION_INEXISTENTE",
          entidad: "USUARIO",
          entidadId: fakeUserId,
        })
      ).rejects.toThrow();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("debe permitir registrar eventos del sistema sin usuarioId (null)", async () => {
      const now = new Date();
      vi.mocked(mockRepo.create).mockResolvedValue({
        id: fakeId,
        usuarioId: null,
        accion: "LOGIN_FALLIDO",
        entidad: "AUTH",
        entidadId: "admin@test.com",
        detalles: null,
        ip: "192.168.1.100",
        createdAt: now,
      });

      const res = await service.registrarEvento({
        usuarioId: null,
        accion: "LOGIN_FALLIDO",
        entidad: "AUTH",
        entidadId: "admin@test.com",
        ip: "192.168.1.100",
      });

      expect(res.usuarioId).toBeNull();
      expect(res.accion).toBe("LOGIN_FALLIDO");
    });
  });

  describe("listarEventos", () => {
    it("debe consultar eventos aplicando filtros y paginación", async () => {
      const now = new Date();
      vi.mocked(mockRepo.list).mockResolvedValue([
        {
          id: fakeId,
          usuarioId: fakeUserId,
          accion: "BAJA_MEDIDOR",
          entidad: "MEDIDOR",
          entidadId: "med-123",
          detalles: JSON.stringify({ motivo: "Falla eléctrica" }),
          ip: "10.0.0.1",
          createdAt: now,
        },
      ]);

      const res = await service.listarEventos({
        accion: "BAJA_MEDIDOR",
        entidad: "MEDIDOR",
        limit: 10,
        offset: 0,
      });

      expect(mockRepo.list).toHaveBeenCalledWith({
        accion: "BAJA_MEDIDOR",
        entidad: "MEDIDOR",
        limit: 10,
        offset: 0,
      });
      expect(res).toHaveLength(1);
      expect(res[0].detalles).toEqual({ motivo: "Falla eléctrica" });
    });
  });

  describe("Invariante Inmutable (Append-Only)", () => {
    it("garantiza que AuditoriaService no expone métodos de modificación o eliminación", () => {
      const proto = Object.getPrototypeOf(service);
      expect(proto.actualizarEvento).toBeUndefined();
      expect(proto.eliminarEvento).toBeUndefined();
      expect(proto.borrarEvento).toBeUndefined();
      expect(proto.update).toBeUndefined();
      expect(proto.delete).toBeUndefined();
    });
  });
});
