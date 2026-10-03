# Sistema Medidores

> **Sistema de registro, gestión y auditoría de medidores industriales y residenciales (agua, electricidad, gas, petróleo/combustible).**
> Desarrollado bajo la metodología **Spec-Driven Development (SDD)**, **Architecture Decision Records (ADR)**, **Agentic TDD** y **Quality Gates Deterministas**.

---

## 🎯 Propósito del Sistema

El sistema **Medidores** proporciona una plataforma robusta y tipada para la captura, control e inspección de mediciones energéticas y de fluidos.

### Actores del Sistema:
1. **Operadores (Data-Entry):** Ingresan lecturas periódicas y eventos de medición en campo o planta.
2. **Administradores:** Configuran medidores, auditan anomalías, consultan históricos y supervisan consumos consolidados.

### Capacidades de Medición:
- **Recursos soportados:** Agua, Electricidad / Luz, Petróleo / Combustible, Gas, entre otros.
- **Tipos de medición:** Acumulativa/Secuencial, Instantánea (flujo o potencia), Porcentaje de Nivel, Volumétrica (Litros, m³).

---

## 🛡️ Invariantes Duras de Negocio

El sistema cuenta con reglas inmutables de consistencia y auditoría formalizadas en [`docs/adr/0001-arquitectura-base.md`](file://docs/adr/0001-arquitectura-base.md):
1. **Lectura no decreciente:** En medidores acumulativos/secuenciales, una nueva lectura jamás puede ser inferior a la lectura inmediata anterior.
2. **Inmutabilidad y auditoría:** Prohibido el borrado físico de registros de lectura (solo bajas lógicas con trazabilidad de operador y timestamp).
3. **Prohibición de fechas futuras:** Ninguna medición puede registrarse con una marca de tiempo posterior a la hora actual.
4. **Unicidad temporal:** Prohibidas lecturas duplicadas para el mismo medidor en el mismo timestamp/período.

---

## 🛠️ Stack Tecnológico

- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) en modo estricto (`"strict": true`, sin `any`).
- **Framework Web:** [Fastify](https://fastify.dev/) para endpoints de alto rendimiento.
- **Persistencia & ORM:** [SQLite](https://www.sqlite.org/) local con [Prisma ORM](https://www.prisma.io/).
- **Validación de Esquemas:** [Zod](https://zod.dev/) para DTOs y validación estricta de entorno.
- **Testing:** [Vitest](https://vitest.dev/) para Agentic TDD determinista.
- **Linter y Estilo:** [ESLint](https://eslint.org/) 9 con `@typescript-eslint`.

---

## 📁 Estructura del Repositorio

```text
├── docs/
│   └── adr/
│       ├── 0000-adopcion-gobernanza-agentica.md  # Constitución génesis
│       └── 0001-arquitectura-base.md            # Arquitectura y stack de Medidores
├── specs/
│   └── templates/
│       ├── feature.template.md                  # Plantilla agnóstica de especificaciones
│       └── feature.md                           # Plantilla personalizada para dominio Medidores
├── src/
│   ├── core/                                    # Núcleo compartido protegido
│   │   ├── config.ts                            # Validador de entorno centralizado con Zod
│   │   └── errors.ts                            # Jerarquía base de DomainError
│   └── modules/                                 # Módulos de dominio desacoplados
│       ├── medidores/                           # Catálogo y configuración de medidores
│       ├── lecturas/                            # Ingesta y auditoría de lecturas
│       └── usuarios/                            # Roles de Operador y Administrador
├── tests/
│   ├── core/                                    # Pruebas del núcleo
│   └── modules/                                 # Pruebas de dominio por módulo
├── scripts/
│   └── verify.sh                                # Barrera determinista del Quality Gate
├── .env.example                                 # Plantilla de variables de entorno
├── AGENTS.md                                    # Reglas operativas para agentes de IA
├── STATE.md                                     # Tablero de control de estado del proyecto
└── package.json                                 # Configuración y dependencias
```

---

## ⚡ Comandos Rápidos

```bash
# Verificación de tipos en modo estricto
npm run typecheck

# Análisis estático y linter
npm run lint

# Ejecución de la suite de pruebas
npm test

# Ejecución del Quality Gate completo
./scripts/verify.sh
```

---

## 🚀 Próximo Paso: Hito 1 (Primer Caso de Uso)

El repositorio se encuentra formalmente constituido y auto-sellado. Para implementar la primera funcionalidad:
1. Copia `specs/templates/feature.md` a `specs/feat-001-<modulo>.md` (ejemplo: `specs/feat-001-registro-medidores.md`).
2. Define los contratos de entrada/salida (Zod), las invariantes y los criterios de aceptación.
3. Solicita al agente:
   > *"Implementa la especificación en `specs/feat-001-registro-medidores.md` siguiendo el ciclo Agentic TDD y superando el Quality Gate."*
