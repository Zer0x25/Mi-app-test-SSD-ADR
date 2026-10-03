# Spec: Autenticación JWT y Control de Acceso RBAC (Admin, Supervisor, Operador)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

Implementar el sistema integral de **Autenticación (JWT)** y **Control de Acceso Basado en Roles (RBAC)** para el sistema Medidores, formalizando tres niveles jerárquicos de operación:

| Rol | Ámbito Territorial / Instalaciones | Permiso Crear Instalación | Permiso Crear Medidor | Permiso Consultar Data & Dashboard | Permiso Registrar Lectura |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ADMIN`** | Global (todas las instalaciones) | ✅ **SÍ** | ✅ **SÍ** (cualquier instalación) | ✅ **SÍ** (global sin filtros) | ✅ **SÍ** |
| **`SUPERVISOR`** | **Limitado a instalaciones asignadas** | ❌ **NO (403 Forbidden)** | ✅ **SÍ (solo en asignadas)** | ✅ **SÍ (solo data asignada)** | ✅ **SÍ (en asignadas)** |
| **`OPERADOR`** | **Limitado a instalaciones asignadas** | ❌ **NO (403 Forbidden)** | ❌ **NO (403 Forbidden)** | ❌ **NO** (solo lista de captura) | ✅ **SÍ (en asignadas)** |

---

## 2. Límites y Archivos Autorizados

- **Archivos editables autorizados:**
  - `prisma/schema.prisma`
  - `src/modules/usuarios/usuarios.schema.ts`
  - `src/modules/usuarios/usuarios.service.ts`
  - `src/modules/usuarios/usuarios.controller.ts`
  - `src/modules/usuarios/usuarios.repository.ts`
  - `src/modules/usuarios/auth.utils.ts`
  - `src/modules/instalaciones/instalaciones.service.ts` (guardia de rol ADMIN)
  - `src/modules/medidores/medidores.service.ts` (guardia de rol y verificación de asignación para SUPERVISOR)
  - `src/server.ts`
  - `tests/modules/usuarios/usuarios.service.test.ts`
  - `tests/modules/usuarios/usuarios.controller.test.ts`
  - `public/js/api.js`
  - `public/js/components.js`
  - `public/app.js`
  - `public/index.html`
  - `STATE.md`
- **Archivos protegidos:**
  - `src/core/config.ts`
  - `src/core/errors.ts`
  - `docs/adr/*`

---

## 3. Contratos de Datos y Esquemas Zod (`usuarios.schema.ts`)

```typescript
import { z } from "zod";

export const RolUsuarioEnum = z.enum(["ADMIN", "SUPERVISOR", "OPERADOR"]);
export type RolUsuario = z.infer<typeof RolUsuarioEnum>;

// Registro de Usuario (exclusivo para setup o administradores)
export const RegistroUsuarioInputSchema = z.object({
  email: z.string().trim().email("Formato de correo electrónico inválido").toLowerCase(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  rol: RolUsuarioEnum.default("OPERADOR"),
});
export type RegistroUsuarioInput = z.infer<typeof RegistroUsuarioInputSchema>;

// Autenticación / Login
export const LoginInputSchema = z.object({
  email: z.string().trim().email("Formato de correo inválido").toLowerCase(),
  password: z.string().min(1, "La contraseña es requerida"),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

// Respuestas Tipadas
export const UsuarioResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  nombre: z.string(),
  rol: RolUsuarioEnum,
  activo: z.boolean(),
  createdAt: z.date(),
});
export type UsuarioResponse = z.infer<typeof UsuarioResponseSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  usuario: UsuarioResponseSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
```

---

## 4. Errores de Dominio Tipados (`src/core/errors.ts` o módulo)

- `CredencialesInvalidasError` (HTTP 401)
- `UsuarioEmailDuplicadoError` (HTTP 409)
- `UsuarioNotFoundError` (HTTP 404)
- `UsuarioInactivoError` (HTTP 403)
- `AccesoDenegadoError` (HTTP 403)
- `InstalacionNoAsignadaError` (HTTP 403)

---

## 5. Criterios de Aceptación y Pruebas Unitarias (Agentic TDD)

### Suite 1: Autenticación & Criptografía
1. **Registro:** Hashea la contraseña con `node:crypto` (scrypt + salt aleatorio) y persiste el usuario.
2. **Rechazo de duplicados:** Intentar registrar el mismo email arroja `UsuarioEmailDuplicadoError`.
3. **Login exitoso:** Verifica la contraseña hasheada y retorna token JWT firmado con payload `{ userId, email, rol, nombre }`.
4. **Login fallido:** Contraseña errónea arroja `CredencialesInvalidasError` (HTTP 401).

### Suite 2: Control de Acceso RBAC
1. **Creación de Instalación:**
   - `ADMIN`: Crea la instalación exitosamente (201).
   - `SUPERVISOR`: Rechazado con `AccesoDenegadoError` (HTTP 403).
   - `OPERADOR`: Rechazado con `AccesoDenegadoError` (HTTP 403).
2. **Creación de Medidores:**
   - `ADMIN`: Crea el medidor en cualquier instalación (201).
   - `SUPERVISOR`: 
     - En una instalación que **TIENE asignada**: Crea el medidor exitosamente (201).
     - En una instalación que **NO tiene asignada**: Rechazado con `InstalacionNoAsignadaError` (HTTP 403).
   - `OPERADOR`: Rechazado con `AccesoDenegadoError` (HTTP 403).
3. **Consulta de Datos & Dashboard:**
   - `ADMIN`: Recibe métricas e información global de todas las sedes.
   - `SUPERVISOR`: Recibe métricas y lecturas filtradas exclusivamente para sus instalaciones asignadas.
   - `OPERADOR`: No tiene acceso al dashboard administrativo; solo accede a la lista de medidores para captura en sus instalaciones asignadas.
