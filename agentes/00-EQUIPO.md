# El equipo de agentes — Índice y reglas comunes (Estándar de Pipeline por Cola de Tareas)

- **Versión:** Estándar 3.0 · Marco de trabajo multiproyecto con Pipeline de Cola de Tareas (`COLA.md`) y Orquestación por Subagentes.

## Los roles y componentes del equipo

| # | Agente / Componente | Propósito en una línea | Prioridad |
|---|---|---|---|
| -- | **Cola de Tareas (COLA.md)** | Motor de tareas independientes asíncronas (`[PENDIENTE]`, `[EN_PROGRESO]`, `[EN_VERIFICACION]`, `[REVISAR_ESPEC]`, `[COMPLETADO]`) | Núcleo del Sistema |
| 01 | **Arquitecto** | Diseña tareas independientes, especifica arquitectura y audita entregas | Existe / Principal |
| 08 | **Cuestionador** | Red Teaming obligatorio: ataca y prueba la falsabilidad de toda propuesta del Arquitecto antes de enviarla a la cola | Alta (Filtro previo) |
| 02 | **Implementador (Edward)** | Construye código/producto con TDD y entrega evidencias ejecutables | Existe / Principal |
| 02B | **Implementador de Infra (Alphonse)** | Conectores, bases de datos, CI/CD, ingestión e infraestructura | Alta (DevOps) |
| 03 | **Verificador (Hornet)** | QA ejecutable: evalúa entregables con pruebas reales y decide si aprueba o re-enruta | Crítica (Filtro QA) |
| 04 | **Documentalista (Robin)** | Apoya la evaluación de QA investigando y certificando fuentes e información | Según requerimiento |
| 05 | **Editor Crítico (Rohan)** | Apoya la evaluación de QA certificando calidad cualitativa, UX y UI copy | Según requerimiento |

## Cadena del Pipeline Estándar

```
[ Requerimiento / Idea ]
          │
          ↓
  [ 01. Arquitecto ] ──────> Genera Tareas Independientes
          │
          ↓
  [ 08. Cuestionador ] ─────> Red Teaming (Ataca supuestos y demuestra falsabilidad)
          │
          ├─ (Si falla) ────> Vuelve al Arquitecto para refinar
          └─ (Si aprueba)  ──> Encola en ./ciclo/COLA.md como [PENDIENTE]
                                      │
                                      ↓
                     [ 02. Implementadores (Edward / Alphonse) ]
                     Toman tareas [PENDIENTE] → cambian a [EN_PROGRESO]
                     Desarrollan con TDD y entregan → cambian a [EN_VERIFICACION]
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
 en ./ciclo/COLA.md            o Robin (Fuentes)         Arquitecto ajusta la orden
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

## Reglas inmutables del Estándar

1. **Toda propuesta pasa por el Cuestionador:** Ninguna tarea ingresa a `./ciclo/COLA.md` sin ser sometida al escrutinio del Cuestionador (Red Teaming).
2. **Re-enrutamiento automático de QA (Hornet):**
   - Si la prueba falla por código/test roto → La tarea regresa a `[PENDIENTE]` en la cola para corregirse.
   - Si la prueba falla por ambigüedad o error en la especificación → Se marca `[REVISAR_ESPEC]` para que el Arquitecto la ajuste.
3. **Soporte cualitativo en QA:** Hornet puede apoyarse en Rohan (UX) o Robin (Fuentes) para validar cambios antes de certificar.
4. **El Líder Humano decide y juzga; nunca depura:** A la sesión humana solo llegan decisiones ratificables y entregables en `./ops/REVISION-HUMANO.md`.
