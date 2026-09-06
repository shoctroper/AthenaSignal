# Plan de Migración e Incorporación Gradual de Agentes

> **Versión Generalizada 2.0** · Guía estratégica para la adopción de equipos de agentes IA en cualquier proyecto.

---

## 1. Principio rector de activación por fases

> **No se requiere mantener todos los agentes activos todo el tiempo: se activan según la fase del proyecto.**

Tener demasiados agentes activos simultáneamente sin tareas asignadas genera fricción de coordinación y consumo ineficiente de recursos. Se adopta la regla: **Agente activo según la fase; dormido el resto.**

| Fase del trabajo | Agentes activos |
|---|---|
| 1. Especificar y diseñar arquitectura | Arquitecto (+ Cuestionador opcional) |
| 2. Desarrollo y construcción | Arquitecto + Implementador / Infra |
| 3. Verificación y entregable usable | + **Verificador (QA)** |
| 4. Investigación de datos o fuentes | + **Documentalista** |
| 5. Revisión cualitativa o UX | + **Editor crítico** |

---

## 2. Orden de incorporación recomendado

| Orden | Agente | Cuándo incorporar | Por qué |
|---|---|---|---|
| **1º** | **Verificador (QA)** | **Inmediato** | Es el rol con mayor impacto para evitar que código o funciones rotas lleguen al humano |
| **2º** | **Implementador de Infra** | Al requerir bases de datos/APIs/CI-CD | Descongestiona al Implementador principal |
| **3º** | **Documentalista** | Al requerir investigación formal o datos | Estructura corpus de información verificables |
| **4º** | **Editor crítico** | Al tener entregables visuales/UI/documentación | Evalúa UX, claridad y tono cualitativo |
| **5º** | **Cuestionador** | Para proyectos complejos/críticos | Desafía las especificaciones del Arquitecto antes de construir |

---

## 3. Protocolo de sesión cero de un agente

El prompt inicial de cualquier agente configurado debe contener **dos componentes**:

1. Su archivo de rol (`./agentes/0X-*.md`) — su contrato operativo completo.
2. El orden de lectura obligatorio al arrancar:

```markdown
1. ./agentes/00-EQUIPO.md          (Reglas comunes del equipo)
2. ./ciclo/ESTADO.md               (Estado vivo actual)
3. Las decisiones ratificadas      (Archivos DU-* y RFC-*)
4. La orden vigente                (./ciclo/ORDEN.md)
5. ./ops/DEUDAS.md                 (Deuda técnica y fallos conocidos)
```

**Regla de arranque:** *No inferir lo que está escrito en archivos.* Si falta información, se declara `Unknown` o `BLOQUEO`.

---

## 4. Handoff por archivos del repositorio

Cada agente posee directorios y archivos específicos para escribir sin sobrescribir el trabajo ajeno:

| Agente | Escribe en | Lee de |
|---|---|---|
| Arquitecto | `./ciclo/ORDEN.md` · `./decisiones/` · `./agentes/` | Todo el proyecto |
| Implementadores | Código fuente · `./ciclo/entregas/` · `./ops/DEUDAS.md` | Órdenes y decisiones |
| Verificador | `./ciclo/veredictos/` · `./ops/qa/` | Órdenes + entregas de implementadores |
| Documentalista | `./ops/corpus-*/` · `./ops/FUENTES-INDICE.md` | Requerimientos + fuentes externas |
| Editor crítico | `./ops/editorial/` | Entregables y documentación |

---

## 5. Medición de valor por agente

| Agente | Métrica de evaluación | Umbral para conservarlo |
|---|---|---|
| Verificador (QA) | Defectos atrapados antes del visto bueno humano | ≥ 1 fallo real atrapado por entrega |
| Documentalista | Porcentaje de datos con cita verificable | > 80% verificado, 0 fuentes inventadas |
| Editor crítico | Coincidencia de sus predicciones con el juicio del Líder Humano | > 70% de aciertos en evaluación |

*Si un agente no aporta valor comprobable tras 3 ciclos, se desactiva.* Un rol sin evidencia es sobrecosto de coordinación.
