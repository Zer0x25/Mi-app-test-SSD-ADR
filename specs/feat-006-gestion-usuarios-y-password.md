# Spec: feat-006 - Gestión Integral de Usuarios, Roles y Cambio de Contraseña

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

Completar el ciclo de administración de cuentas y seguridad del sistema Medidores mediante:
1. **Auto-servicio de Contraseña:** Todo usuario autenticado (`ADMIN`, `SUPERVISOR`, `OPERADOR`) puede actualizar su propia contraseña ingresando la contraseña actual y la nueva.
2. **Administración de Usuarios (`ADMIN` Exclusivo):**
   - Listar todos los usuarios del sistema junto con sus roles, estados y las instalaciones asignadas.
   - Modificar datos del usuario: nombre, rol jerárquico, estado (activo/inactivo) y sincronización de instalaciones asignadas.
   - Restablecimiento administrativo de contraseña (`reset-password`) en caso de olvido o desbloqueo en terreno.
3. **Protección RBAC:** Ningún usuario con rol `SUPERVISOR` u `OPERADOR` puede acceder al listado de usuarios, editar otros usuarios o restablecer contraseñas ajenas (HTTP 403 Forbidden).

---

## 2. Archivos Editables Autorizados

- `specs/feat-006-gestion-usuarios-y-password.md`
- `src/modules/usuarios/usuarios.schema.ts`
- `src/modules/usuarios/usuarios.service.ts`
- `src/modules/usuarios/usuarios.controller.ts`
- `src/modules/usuarios/usuarios.repository.ts`
- `src/server.ts`
- `tests/modules/usuarios/usuarios.service.test.ts`
- `tests/modules/usuarios/usuarios.controller.test.ts`
- `public/js/api.js`
- `public/js/components.js`
- `public/app.js`
- `public/index.html`
- `STATE.md`

---

## 3. Contratos de Datos y Esquemas Zod

```typescript
// 1. Cambio de contraseña por el usuario conectado
export const CambiarPasswordInputSchema = z.object({
  passwordActual: z.string().min(1, "La contraseña actual es requerida"),
  passwordNueva: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});
export type CambiarPasswordInput = z.infer<typeof CambiarPasswordInputSchema>;

// 2. Restablecimiento administrativo de contraseña por Admin
export const ResetPasswordInputSchema = z.object({
  passwordNueva: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

// 3. Edición de usuario por Admin
export const EditarUsuarioInputSchema = z.object({
  nombre: z.string().trim().min(2).optional(),
  rol: RolUsuarioEnum.optional(),
  activo: z.boolean().optional(),
  instalacionesIds: z.array(z.string().uuid()).optional(),
});
export type EditarUsuarioInput = z.infer<typeof EditarUsuarioInputSchema>;

// 4. Respuesta detallada de usuario con sus sedes
export const UsuarioConAsignacionesResponseSchema = UsuarioResponseSchema.extend({
  instalaciones: z.array(
    z.object({
      id: z.string().uuid(),
      nombre: z.string(),
    })
  ),
});
export type UsuarioConAsignacionesResponse = z.infer<typeof UsuarioConAsignacionesResponseSchema>;
```

---

## 4. Errores de Dominio Tipados

- `PasswordActualInvalidaError` (HTTP 401): Disparado cuando la contraseña actual no coincide.
- `UsuarioNotFoundError` (HTTP 404): Usuario no existe al editar o resetear.
- `AccesoDenegadoError` (HTTP 403): Intento de gestión o reseteo por parte de un no-admin.

---

## 5. Criterios de Aceptación y Pruebas Unitarias (Agentic TDD)

### Suite de Servicio (`usuarios.service.test.ts`):
1. **Cambio de contraseña exitoso:** Verifica la contraseña actual, hashea la nueva y actualiza el registro.
2. **Rechazo de cambio de contraseña:** Si la contraseña actual no coincide, lanza `PasswordActualInvalidaError` y no modifica el hash.
3. **Reset de contraseña por Admin:** Actualiza el hash de contraseña sin requerir la clave anterior.
4. **Listado de usuarios con asignaciones:** Retorna todos los usuarios con el array de sus sedes asignadas.
5. **Edición de usuario:** Actualiza nombre, rol, estado activo/inactivo y sincroniza las asignaciones de instalaciones.

### Suite de Controlador (`usuarios.controller.test.ts`):
1. `POST /api/auth/cambiar-password`:
   - 200 OK con contraseña actual correcta.
   - 401 con contraseña actual incorrecta.
2. `GET /api/usuarios`:
   - 200 OK cuando el token pertenece a un `ADMIN`.
   - 403 Forbidden cuando el token pertenece a un `SUPERVISOR` o `OPERADOR`.
3. `PATCH /api/usuarios/:id`:
   - 200 OK cuando `ADMIN` edita rol o instalaciones.
   - 403 Forbidden si lo intenta un no-admin.
4. `POST /api/usuarios/:id/reset-password`:
   - 200 OK cuando `ADMIN` restablece la contraseña.
   - 403 Forbidden para otros roles.
