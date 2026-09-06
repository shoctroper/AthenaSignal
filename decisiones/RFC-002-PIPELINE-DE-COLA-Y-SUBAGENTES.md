# RFC-002 — Pipeline de Cola de Tareas y Orquestación Automatizada con Subagentes

- **Fecha:** 2026-09-05
- **Emite:** Arquitecto
- **Revisado por:** Cuestionador
- **Estado:** PROPUESTA RATIFICABLE

---

## 1. Problema del modelo anterior
El rol de IMU como coordinador manual generaba overhead de mensajería (pasar mensajes manualmente en el chat). El modelo requiere un esquema **desacoplado basado en cola de tareas (Task Queue)** y ejecución impulsada por eventos y subagentes.

---

## 2. Nuevo Flujo del Pipeline (Arquitectura de Cola + Subagentes)

```
[ Requerimiento / Idea ]
          │
          ↓
  [ 01. Arquitecto ] ──────> Genera Tarea Independiente
          │
          ↓
  [ 08. Cuestionador ] ─────> Red Teaming (Ataca supuestos y falsabilidad)
          │
          ├─ (Si se rompe) ──> Vuelve al Arquitecto para refinar
          └─ (Si aprueba)  ──> Aterriza en ./ciclo/COLA.md como [PENDIENTE]
                                      │
                                      ↓
                     [ 02. Implementadores (Edward / Alphonse) ]
                     Toman tarea [PENDIENTE] → cambian a [EN_PROGRESO]
                     Construyen con TDD y entregan → cambian a [EN_VERIFICACION]
                                      │
                                      ↓
                        [ 03. Verificador (Hornet / QA) ]
                        Ejecuta pruebas reales y linters
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
   (Falla de Código/Test)     (Requiere Visto Bueno     (Error de Especificación)
           │                   Cualitativo/Fuentes)              │
           ↓                          │                          ↓
  Vuelve a [PENDIENTE]         Invoca a Rohan (UX)      Marca [REVISAR_ESPEC]
 en ./ciclo/COLA.md            o Robin (Fuentes)         Arquitecto refina tarea
 para que el Implementador    para certificar           y la re-inyecta a la cola
 corrija el código            junto con Hornet
           │                          │                          │
           └──────────────────────────┴──────────────────────────┘
                                      │
                                      ↓
                                [ COMPLETADO ]
                                      │
                                      ↓
                    [ 01. Auditoría Final de Arquitecto ]
                                      │
                                      ↓
                    [ ./ops/REVISION-HUMANO.md ]
```

---

## 3. Estados de una Tarea en `./ciclo/COLA.md`

| Estado | Significado | Quién la toma |
|---|---|---|
| `[EN_DISCUSION]` | Tarea propuesta por Arquitecto bajo evaluación del Cuestionador | Cuestionador |
| `[PENDIENTE]` | Tarea lista y validada para ser tomada | Edward (Código) / Alphonse (Infra) |
| `[EN_PROGRESO]` | Tarea en desarrollo activo por un Implementador | Implementador asignado |
| `[EN_VERIFICACION]` | Código/Entregable listo para pruebas de QA | Hornet (QA) (+ Rohan / Robin si aplica) |
| `[REVISAR_ESPEC]` | QA detectó defecto en la orden o ambigüedad | Arquitecto |
| `[COMPLETADO]` | Tarea probada, verificada y certificada | Arquitecto / Líder Humano |

---

## 4. Ejecución en Antigravity mediante `invoke_subagent`

Antigravity puede invocar directamente subagentes especializados en segundo plano mediante `invoke_subagent`:
1. El Arquitecto redacta la tarea y ejecuta el Cuestionador.
2. Tras la aprobación, invoca al subagent `Edward` o `Alphonse` para procesar las tareas `[PENDIENTE]`.
3. Al recibir la entrega, invoca al subagente `Hornet` para ejecutar la verificación.
4. Si se requiere evaluación cualitativa, invoca en paralelo a `Rohan` o `Robin`.
5. Si pasa la verificación, el Arquitecto consolida en `./ops/REVISION-HUMANO.md`.
