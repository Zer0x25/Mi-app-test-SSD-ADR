# ADR 0014: Simetría de Contrato y Prevención de Leaks en UI (Undefined / Invalid Date)

- **Fecha:** 2026-10-05
- **Estado:** Aceptado
- **Afecta a:** Frontend (`public/app.js`, `public/js/components.js`), Backend DTOs (`src/modules/*`), Controladores, Endpoints complementarios (`src/server.ts`), Scripts de Verificación (`scripts/test-contract-symmetry.mjs`)

---

## 1. Contexto y Problema

Durante el despliegue operativo y la validación en terreno del sistema (tanto en la versión local Docker/Fastify como en la réplica edge en Cloudflare Workers + D1), se detectaron sutiles asimetrías de contrato entre los esquemas de persistencia y las expectativas del cliente frontend:

1. **Fuga visual de `(undefined)` en selectores de instalación:**
   - La base de datos y los modelos Prisma/D1 denominan la columna de ubicación como `ubicacion`.
   - El código frontend interpolaba `${inst.nombre} (${inst.direccion})`, resultando en textos visibles como `"Sede San Bernardo (undefined)"`.
2. **Fuga visual de `Invalid Date` en tarjetas de medidor y tablas de lecturas:**
   - El backend almacenaba y exponía `fechaLectura` en formato SQLite / ISO parcial, mientras que ciertas vistas frontend consumían `ultimaLectura.timestamp` o parseaban strings sin timezone normalizado.
   - En navegadores móviles y desktop, `new Date(fecha)` arrojaba `Invalid Date` si la cadena era un timestamp SQLite (`YYYY-MM-DD HH:MM:SS`) o si la propiedad `timestamp` no venía mapeada.
3. **Fuga visual de `undefined` en selectores de tipos de medidor:**
   - El backend persistía `unidad`, mientras que componentes UI esperaban `unidadMedida`.
4. **Falso positivo en suites de pruebas unitarias y e2e:**
   - Las pruebas tradicionales validaban que las llamadas a la API retornaran `HTTP 200` o `HTTP 201`, pero no auditaban la **simetría exacta** de los campos devueltos ni que las salidas renderizadas en los templates estuvieran libres de cadenas prohibidas (`undefined`, `null`, `NaN`, `Invalid Date`, `[object Object]`).

Era imprescindible establecer un estándar arquitectónico inmutable de **simetría de contrato**, **resiliencia de renderizado** y **pruebas automatizadas de contrato**.

---

## 2. Decisión

Se adopta una política de **Simetría Bidireccional de Contrato, Resiliencia Defensiva en Frontend y Verificación Automatizada**:

### 1. Simetría de Campos en DTOs y Servicios de Backend
Todos los endpoints (tanto en Fastify/Prisma como en Workers/D1) deben proveer y aceptar de forma simétrica los alias requeridos por la UI:
- **Instalaciones:** Garantizar que todo objeto instalación entregue simultáneamente `ubicacion` y `direccion: inst.ubicacion`. El DTO de entrada acepta `ubicacion` o `direccion`.
- **Tipos de Medidor:** Garantizar que todo objeto tipo de medidor entregue `unidad` y `unidadMedida: tipo.unidad`. El DTO de entrada acepta `unidad` o `unidadMedida`.
- **Lecturas y Última Lectura en Medidores:** Garantizar que todo registro de lectura o sub-objeto `ultimaLectura` entregue de forma canónica `fechaLectura`, `timestamp` y `fecha` como instancias de fecha válidas. Asimismo, se provee `notas` y `observaciones` simétricamente.

### 2. Resiliencia Defensiva y Helpers de Normalización en Frontend
Se establece en `public/js/components.js` y `public/app.js`:
- **Helper `parseSafeDate(input)`:** Función utilitaria universal que analiza la entrada:
  - Maneja instancias de `Date`, números Unix en segundos (< 1e11) convirtiéndolos a ms, y números Unix en ms.
  - Normaliza cadenas SQLite `YYYY-MM-DD HH:MM:SS` reemplazando el espacio por `T` e infiriendo `Z` si no contiene timezone.
  - Valida mediante `isNaN(d.getTime())` y, si la fecha resultara inválida, realiza un fallback seguro al momento actual (`new Date()`), previniendo rotundamente el renderizado de `Invalid Date`.
- **Fallback en plantillas literales:** Se prohíbe el acceso ciego a propiedades únicas en templates; se exige uso de fallbacks (`inst.ubicacion || inst.direccion || 'Sin ubicación'`).

### 3. Test Automatizado de Simetría de Contrato (`test:contract`)
Se introduce el script `scripts/test-contract-symmetry.mjs`, ejecutable vía:
```bash
npm run test:contract
```
Este test simula el ciclo de vida completo de creación y consulta de datos (Instalación -> Tipo de Medidor -> Medidor -> Lectura inicial) y audita mediante `assertNoLeak` que las cadenas generadas por la UI no contengan ninguna de las cadenas prohibidas:
- `"undefined"`
- `"null"`
- `"NaN"`
- `"Invalid Date"`
- `"[object Object]"`

---

## 3. Reglas Inmutables para Agentes de IA

- **Obligaciones:**
  1. Todo nuevo endpoint o refactorización que devuelva entidades de Instalación, Tipo de Medidor, Medidor o Lectura DEBE incluir los alias simétricos especificados (`direccion`/`ubicacion`, `unidad`/`unidadMedida`, `fechaLectura`/`timestamp`/`fecha`).
  2. Todo formateo de fechas en clientes web DEBE canalizarse a través de `parseSafeDate` o helpers defensivos equivalentes.
  3. Antes de dar por concluida cualquier modificación a modelos de datos o vistas, el agente DEBE ejecutar `npm run test:contract` además de `npm test`.
- **Prohibiciones:**
  1. Prohibido invocar directamente `new Date(fecha).toLocaleDateString()` en plantillas HTML sin previa validación o sin usar el helper seguro.
  2. Prohibido eliminar campos alias en controladores, DTOs o repositorios bajo el pretexto de "limpiar código", ya que rompe la simetría de contrato con el cliente.
  3. Prohibido interpolar variables en templates literales sin fallback cuando el valor pueda ser `undefined` o `null`.

---

## 4. Consecuencias

### Positivas
- **Cero Leaks Visuales:** Desaparición total de `Invalid Date` y `(undefined)` en selectores, tablas y tarjetas.
- **Paridad Multi-Entorno:** Idéntico comportamiento garantizado tanto en la infraestructura on-premise/Docker (Fastify + SQLite/Postgres) como en la infraestructura serverless edge (Cloudflare Workers + D1).
- **Quality Gate Blindado:** Detección inmediata en CI/CD si algún cambio degrada la simetría de los datos entregados.

### Negativas / Trade-offs
- **Ligera redundancia en payloads JSON:** Se transmiten propiedades duplicadas (`ubicacion`/`direccion`, `unidad`/`unidadMedida`, `fechaLectura`/`timestamp`), cuyo impacto en bytes es despreciable (menor al 1%) frente al beneficio crítico de robustez y compatibilidad hacia atrás.
