# ADR 0002: Arquitectura del Frontend, Design System y Desacoplamiento de Lógica de Negocio

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Capa de Presentación (`public/` y clientes web futuros), Design System, Consumo de APIs

---

## 1. Contexto y Problema

El sistema **Medidores** cuenta con interfaces operativas y administrativas de alta densidad informativa (dashboard de auditoría, panel de operador de campo, y próximas pantallas de autenticación, catálogos y reportes).

La ausencia de un estándar arquitectónico formal para la interfaz de usuario genera riesgos críticos:
1. **Deriva Visual (Visual Drift):** Disparidad de estilos, bordes, tipografías y sombras a medida que se agregan nuevas pantallas.
2. **Duplicación de Lógica de Negocio en el Cliente:** Riesgo de replicar validaciones de invariantes (lecturas decrecientes, cálculo de consumos, autorización de instalaciones) en JavaScript del navegador, violando el principio de fuente única de verdad.
3. **Acoplamiento por `fetch` Disperso:** Llamadas HTTP desordenadas con URLs en texto duro sin manejo uniforme de errores ni gestión centralizada de tokens de autenticación.
4. **Duplicación de Código (WET):** Creación reiterativa de elementos como modales, tarjetas de medidores (*fichas*), notificaciones y campos de formulario.

---

## 2. Decisión

Se aprueba la arquitectura formal para el frontend basada en 4 pilares:

### 2.1. Arquitectura «Thin-Client» (Cero Lógica de Dominio en el Frontend)
- **Principio:** El frontend es puramente **presentacional y reactivo**.
- **Regla inmutable:** Queda terminantemente prohibido calcular o validar reglas de negocio en el cliente.
  - El backend (Fastify + Domain Services) es la **única fuente de verdad** para:
    - Validación de no-decrecimiento en medidores acumulativos.
    - Prohibición de fechas futuras o timestamps duplicados.
    - Asignación y verificación de permisos operador-instalación.
    - Agregación y cálculo ponderado de consumos netos.
- La responsabilidad del frontend se restringe a:
  1. Captura de eventos e inputs del usuario.
  2. Invocación de la capa de transporte (`ApiClient`).
  3. Renderizado del estado visual y manejo de errores semánticos recibidos desde la API.
  4. Lógica de presentación pura (abrir/cerrar modales, conmutar vistas, alternar tema claro/oscuro, formateo de números con `Intl.NumberFormat`).

### 2.2. Capa de Transporte Centralizada (`ApiClient`)
- Todo acceso a endpoints HTTP se realiza obligatoriamente mediante un cliente unificado (`public/js/api.js`).
- El cliente se encarga de:
  - Centralizar URLs base y endpoints mediante métodos semánticos (`api.dashboard.getSummary()`, `api.lecturas.registrar()`, `api.auth.login()`).
  - Inyectar de manera transparente cabeceras de autorización (`Authorization: Bearer <token>`).
  - Mapear respuestas no exitosas a objetos tipados `ApiError` que preservan el código de dominio y el mensaje del servidor.

### 2.3. Componentes Atómicos Reutilizables y Factorización de Código
Se adopta una arquitectura de componentes modulares y factorizados (`public/js/components.js`):
1. **Fichas de Medidor (`createMeterCard`):** Tarjeta estandarizada que recibe el DTO de un medidor y renderiza su icono semántico según recurso, métricas tabulares, badge de estado y disparador de acción.
2. **Sistema Unificado de Modales (`ModalComponent`):**
   - Una única estructura modal en el DOM que maneja backdrop desenfocado, tecla `Escape`, clic exterior y trampa de foco accesible.
   - Los formularios (registro de lectura, login, altas) se inyectan dinámicamente como plantillas de contenido.
3. **Tarjetas KPI (`createKpiCard`):** Componente unificado para las métricas del dashboard (icono, etiqueta, valor destacado y estado).
4. **Sistema Global de Toasts (`ToastNotification`):** Mecanismo no intrusivo y accesible para alertas (`toast.success()`, `toast.error()`, `toast.warning()`).

### 2.4. Design System «Medidores Aurora» (Tokens Semánticos & Modo Claro/Oscuro)
- El sistema de diseño se construye sobre **CSS Custom Properties puras** (sin Tailwind, según mandato del proyecto):
  - **Tokens Semánticos:** `--bg-canvas`, `--bg-surface`, `--bg-surface-hover`, `--bg-input`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle`, `--border-focus`, `--accent-primary`.
  - **Paleta de Recursos Industriales:** `--meter-water` (Agua / Cian), `--meter-elec` (Electricidad / Ámbar), `--meter-fuel` (Combustible / Naranja), `--meter-gas` (Gas / Rosa).
  - **Tipografía:** `Outfit` para títulos y KPIs; `Plus Jakarta Sans` para interfaces y formularios; `JetBrains Mono` con `font-variant-numeric: tabular-nums` para lecturas y cifras numéricas.
- **Dual Theme (Claro / Oscuro):**
  - Soporte nativo para `color-scheme: light dark;`.
  - Detección automática de preferencia del sistema (`prefers-color-scheme`).
  - Persistencia de selección de usuario en `localStorage` (`medidores-theme`).
  - **Zero-FOUC:** Script síncrono ultra-rápido en el `<head>` antes de pintar el DOM para evitar parpadeos visuales al recargar.

---

## 3. Reglas Inmutables para Agentes de IA y Desarrolladores

### Obligaciones
- Toda vista o componente nuevo debe construirse consumiendo exclusivamente los **tokens semánticos** del Design System.
- Cualquier llamada a la API debe agregarse o ejecutarse a través de `ApiClient`.
- El manejo de errores devueltos por la API debe mostrarse al usuario utilizando el sistema unificado de toasts o mensajes inline en el formulario, sin alertas nativas (`alert()`).
- La interacción modal debe utilizar el contenedor `ModalComponent` existente en lugar de crear nuevos `<div class="modal">` estáticos en el HTML.

### Prohibiciones
- **Prohibido duplicar lógica de negocio en el frontend.**
- **Prohibido el uso de estilos inline** (`style="..."`) o colores hexadecimales duros dentro de selectores específicos de componentes (`#fff`, `#000`, `rgba(...)`). Todos los colores deben provenir de `var(--...)`.
- **Prohibido el uso de `fetch` directo** en controladores de eventos o vistas.
- **Prohibido el uso de frameworks pesados (React, Angular, Vue)** en este hito sin un ADR previo que justifique la necesidad. Se preserva Vanilla JS/CSS moderno, rápido y sin transpilación para el cliente web integrado.

---

## 4. Consecuencias

### Positivas
- **Inmunidad a la Deriva Visual:** Cada nueva pantalla (incluida la autenticación) se ensamblará instantáneamente con la identidad visual ya probada.
- **Separación de Responsabilidades Real:** El backend conserva el 100% de la autoridad del dominio y auditoría; la UI es un reflejo fidedigno y ligero.
- **Mantenimiento Simplificado:** Cambiar la apariencia general de la aplicación o ajustar el modo claro/oscuro requiere únicamente editar los tokens en `tokens.css`.
- **Experiencia de Usuario Industrial:** Contraste calibrado para entornos de baja luz (sala de máquinas/campo) y alta luminosidad (oficina administrativa).

### Negativas / Trade-offs
- Se requiere disciplina estricta al crear nuevos componentes para no romper la convención de tokens ni agregar peticiones `fetch` fuera de `ApiClient`.
