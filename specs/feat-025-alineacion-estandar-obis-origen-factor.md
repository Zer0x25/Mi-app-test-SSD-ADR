# Spec: feat-025-alineación estándar (factor por activo, código externo, origen de lectura)

> **Instrucción para el Agente:** Contrato cerrado bajo SDD + Agentic TDD. No escribir código de producción sin pruebas rojas previas. Modificar exclusivamente los archivos autorizados.

---

## 1. Propósito

Alinear el constructo a la semántica general (CIM/OBIS/OMS + inventario EPA) sin romper lo existente:

1. El factor vive hoy en `TipoMedidor`; en la práctica pertenece al activo (transformador de la instalación). Añadir override por medidor: `factorInstalacion`.
2. Falta slot de identificador externo interoperable (ID M-Bus / OBIS / serie del fabricante): `codigoExterno`.
3. Falta trazabilidad del origen de la lectura (manual vs ajuste vs importada): `origen`.

Sin cambios de comportamiento por defecto: con campos nulos, todo se comporta bit a bit como hoy.

---

## 2. Archivos editables autorizados

- `specs/feat-025-alineacion-estandar-obis-origen-factor.md`
- `prisma/schema.prisma`
- `src/modules/medidores/medidores.schema.ts`
- `src/modules/medidores/medidores.service.ts`
- `src/modules/medidores/medidores.repository.ts`
- `src/modules/lecturas/lecturas.schema.ts`
- `src/modules/lecturas/lecturas.service.ts`
- `src/modules/lecturas/lecturas.repository.ts`
- `src/server.ts`
- `public/index.html`
- `public/app.js`
- `tests/modules/medidores/medidores.service.test.ts`
- `tests/modules/lecturas/lecturas.service.test.ts`
- `e2e/estandar-alineacion.spec.ts`
- `STATE.md`

- **Protegidos:** `src/core/*`, `docs/adr/*`, `public/js/api.js` (passthrough JSON, sin cambios), resto de `src/modules/*`.

---

## 3. Modelo y Zod

### 3.1 Prisma

```prisma
model Medidor {
  ...
  codigoExterno     String? @unique
  factorInstalacion Float?
  ...
}
model Lectura {
  ...
  origen String @default("MANUAL") // MANUAL, AJUSTE, IMPORTADA
  ...
}
```

### 3.2 Zod

- `OrigenLecturaEnum = z.enum(["MANUAL", "AJUSTE", "IMPORTADA"])`.
- `CrearMedidorInputSchema`: `codigoExterno: z.string().trim().min(3).max(100).nullable().optional()`, `factorInstalacion: z.number().positive().max(1000000).nullable().optional()`.
- `EditarMedidorInputSchema`: mismos dos campos opcionales (edición libre, como `numeroSerie`: no es identidad sellada; el `codigo` interno sigue con ventana de gracia).
- `MedidorResponseSchema`: ambos campos `nullable().optional()`.
- `RegistrarLecturaInputSchema` y `BatchSyncItemSchema`: `origen: OrigenLecturaEnum.optional().default("MANUAL")`.
- `LecturaResponseSchema`: `origen: OrigenLecturaEnum.default("MANUAL")` (con default para filas legacy en serialización).
- Tipos TS de entidades: campos nuevos opcionales/nullable para no romper mocks existentes.

### 3.3 Error tipado nuevo

- `MedidorCodigoExternoDuplicadoError`: `code "MEDIDOR_CODIGO_EXTERNO_DUPLICADO"`, `404→409`. Se verifica en `crearMedidor` y `editarMedidor` solo cuando se provee valor no nulo.

---

## 4. Invariantes

1. **Factor efectivo:** `efectivo = factorInstalacion ?? tipo.multiplicador ?? 1`. `LecturasService` lo recibe vía `IMedidorInfoService.getMedidorInfo` (server lo calcula). `valorReal = round2(bruto * efectivo)`; se persiste `valor=real`, `valorBruto=bruto`, `multiplicadorAplicado=efectivo`.
2. **Compatibilidad total:** con `factorInstalacion=null` el efectivo es el del tipo (hoy 1 en seed); con `origen` ausente se asume `MANUAL`; `codigoExterno=null` no valida unicidad.
3. **Edición:** `codigoExterno` y `factorInstalacion` editables en cualquier momento por `ADMIN` (igual que `ubicacionInterna`/`numeroSerie`); el cambio queda en el snapshot de auditoría `MEDIDOR_EDITADO` (antes/después extendido).
4. **Batch sync:** propaga `origen` por ítem; sin `origen` → `MANUAL`.

---

## 5. Criterios de aceptación (Agentic TDD)

### Suite 1 — Factor por activo (medidores + lecturas)
- `crearMedidor` con `codigoExterno: "OBIS-1-0:1.8.0-FF"` y `factorInstalacion: 20` persiste y retorna ambos; duplicar `codigoExterno` en otro medidor → `MedidorCodigoExternoDuplicadoError` (409).
- `editarMedidor` actualiza `factorInstalacion` y `codigoExterno` sin restricción de gracia.
- Lectura con bruto `5` sobre medidor con `factorInstalacion=20` (tipo ×1) guarda `valor=100, multiplicadorAplicado=20`; con `factorInstalacion=null` usa el del tipo.

### Suite 2 — Origen de lectura
- `registrarLectura` sin `origen` guarda `MANUAL`; con `origen: "AJUSTE"` guarda `AJUSTE`; `origen: "X"` rechaza por Zod; batch mixto propaga orígenes por ítem.

### Suite 3 — E2E `e2e/estandar-alineacion.spec.ts`
- Desde `#/parque`: alta de medidor con `codigoExterno` y factor; el alta aparece en `tbody-gestion-medidores`.
- En `#/operador` (ADMIN): lectura al medidor con factor guarda real = bruto × factor (verificado vía `window.api` en `page.evaluate` con tipos estrictos, sin `any`).
- `codigoExterno` duplicado vía UI muestra toast de error.

### Quality Gate
- `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test e2e/estandar-alineacion.spec.ts` verdes; `./scripts/verify.sh` salida 0 sin regresiones.
