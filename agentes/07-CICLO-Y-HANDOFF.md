# El ciclo de trabajo y el contrato de handoff por cola de tareas

> **Versión Estándar 3.2** · Marco multiproyecto con Pipeline por Cola de Tareas (`COLA.md`), Enrutamiento Multi-Modelo y Auditoría Final.
> **Vinculante para todos los roles de agentes y para el Líder Humano.**

---

## 1. REGLA DURA: Contador Incremental y Límite Inviolable de 15 Turnos

- **Incremento Obligatorio:** En cada intervención dentro de un mismo chat/sesión, el agente DEBE incrementar secuencialmente su contador (`turno 1/15`, `turno 2/15`...).
- **Corte Duro al Turno 15:** **Ninguna conversación debe superar los 15 mensajes.** Al llegar al `turno 15/15`, el agente detiene toda ejecución, guarda el estado actual y solicita al humano abrir una nueva sesión.
- **Firma al pie:** Toda respuesta concluye con:
  `turno N/15 · fase: [DIAGNOSTICAR | EJECUTAR | VERIFICAR] · ítem: <ID>`

---

## 2. Fase de Diseño y Generación de Tareas

1. **Arquitecto y Cuestionador (Red Teaming):** El Arquitecto propone una arquitectura. El Cuestionador evalúa y trata de romperla. Una vez que llegan a un consenso, el Arquitecto emite la Orden.
2. **Cola por Proyecto (`COLA.md`):** Las tareas se registran. Dado que manejamos múltiples proyectos y modelos, **TODA TAREA** debe venir con información sobre con qué modelo/executor debe correr.
   - *Ejemplo de metadata:* `[Model: deepseek-v4-pro]` (alta demanda), `[Model: qwen2.5-7b SSH]` (código estándar), `[Model: deepseek-web]` (navegador).

---

## 3. El Pipeline de Ejecución Dinámico

1. **El Orquestador (Dispatcher):** Lee las tareas `[PENDIENTE]`. En base a los requerimientos de la tarea y la disponibilidad (falta de tokens de Gemini/DeepSeek, saturación del MacBook), deriva a:
   - **Antigravity CLI / Claude CLI:** Ejecución local.
   - **SSH (`athena`):** Invocación a modelos Ollama (`qwen2.5:7b-instruct` / `qwen2.5:3b`) que se ajustan al trabajo sin cargar la Mac.
   - **Navegador (Playwright):** Automatización de la UI de DeepSeek/Gemini cuando no hay tokens de API.
2. **Implementador:** Toma la tarea derivada, desarrolla y la mueve a `[EN_VERIFICACION]`.
3. **Verificador (`Hornet` / QA):** Prueba el artefacto. Si pasa, lo marca `[COMPLETADO]`. Si falla, `[PENDIENTE]`.

---

## 4. Auditoría Total de Proyecto

Cuando **TODAS** las tareas de un proyecto en `COLA.md` han sido concluidas (`[COMPLETADO]`), el sistema bloquea nuevas ingestas para ese proyecto y se convoca al **Arquitecto** para una Auditoría Total. 
El Arquitecto revisa el código final interconectado, sella el proyecto y emite el informe al Líder Humano.
