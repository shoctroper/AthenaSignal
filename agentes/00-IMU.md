# Componente 00 — Motor de Cola de Tareas y Despacho Automatizado (COLA.md)

> **Versión Estándar 3.0** · Reemplaza la coordinación manual por un pipeline de tareas asíncrono e impulsado por eventos.
> **Ubicación:** `./ciclo/COLA.md` y `./ciclo/ESTADO.md`.

---

## Propósito

Eliminar el sobrecosto de coordinación conversacional y mensajería en el chat. Las tareas se gestionan como un flujo en `./ciclo/COLA.md` con estados declarativos:

- `[EN_DISCUSION]`: En evaluación del Cuestionador.
- `[PENDIENTE]`: Lista para ser procesada por un Implementador.
- `[EN_PROGRESO]`: En desarrollo activo.
- `[EN_VERIFICACION]`: En pruebas ejecutables por Hornet (QA).
- `[REVISAR_ESPEC]`: Marcada por QA para que el Arquitecto afine la especificación.
- `[COMPLETADO]`: Verificada y certificada.

---

## Ciclo de Vida Automático de la Cola

1. **Ingreso:** El Arquitecto crea la tarea → El Cuestionador evalúa la falsabilidad → Si aprueba, pasa a `[PENDIENTE]`.
2. **Asignación y Desarrollo:** Subagente `Edward` (código) o `Alphonse` (infra) toma la tarea `[PENDIENTE]` → Pasa a `[EN_PROGRESO]` → Emite la entrega en `./ciclo/entregas/` → Pasa a `[EN_VERIFICACION]`.
3. **Verificación QA:** Subagente `Hornet` ejecuta pruebas reales:
   - **Aprobado:** Pasa a `[COMPLETADO]`.
   - **Falla de Código:** Pasa a `[PENDIENTE]` en la cola.
   - **Falla de Especificación:** Pasa a `[REVISAR_ESPEC]` para ajuste del Arquitecto.
   - **Verificación Cualitativa:** Hornet invoca a `Rohan` (UX) o `Robin` (Fuentes) si aplica.
