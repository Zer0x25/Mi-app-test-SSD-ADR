# ADR [Número]: [Título de la Decisión Arquitectónica]

- **Fecha:** YYYY-MM-DD
- **Estado:** Propuesto | Aceptado | Reemplazado | Obsoleto
- **Afecta a:** [Módulos, capas o componentes afectados por esta decisión]

---

## 1. Contexto y Problema
[Describe el contexto, la necesidad técnica o de negocio, y las alternativas evaluadas. Explica qué problema se busca resolver y por qué es necesario fijar una decisión formal e inmutable.]

---

## 2. Decisión
[Detalla la decisión técnica adoptada de manera concisa y rigurosa.]

1. **[Punto principal de decisión 1]:** [Detalle de tecnologías, librerías o patrones].
2. **[Punto principal de decisión 2]:** [Reglas de persistencia, transporte o validación].
3. **[Punto principal de decisión 3]:** [Criterios de integración o separación modular].

---

## 3. Reglas Inmutables para Agentes de IA
[Directrices explícitas para gobernar el comportamiento de los modelos de lenguaje en este repositorio]

- **Obligaciones:** [Lo que el agente SIEMPRE debe hacer respecto a esta decisión. Ej: derivar DTOs desde esquemas Zod].
- **Prohibiciones:** [Lo que el agente NUNCA debe sugerir ni implementar. Ej: prohibido el uso de casteos manuales o librerías alternas].

---

## 4. Consecuencias

### Positivas
- [Beneficio 1: Ej. Coherencia en toda la base de código]
- [Beneficio 2: Ej. Eliminación de alucinaciones en modelos de IA]

### Negativas / Trade-offs
- [Costo o limitación asumida: Ej. Mayor rigidez inicial al definir esquemas antes de codificar]
