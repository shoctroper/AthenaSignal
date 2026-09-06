# El ciclo de trabajo y el contrato de handoff por cola de tareas

> **Versión Estándar 3.1** · Marco de trabajo multiproyecto con Pipeline por Cola de Tareas (`COLA.md`) y Corte Duro en Turno 15.
> **Vinculante para todos los roles de agentes y para el Líder Humano.**

---

## 1. REGLA DURA: Contador Incremental y Límite Inviolable de 15 Turnos

- **Incremento Obligatorio:** En cada intervención dentro de un mismo chat/sesión, el agente DEBE incrementar secuencialmente su contador (`turno 1/15`, `turno 2/15`, `turno 3/15`...).
- **Corte Duro al Turno 15:** **Ninguna conversación debe superar los 15 mensajes.** Al llegar al `turno 15/15`, el agente detiene toda ejecución, guarda el estado actual en `./ciclo/ESTADO.md` y solicita al humano abrir una nueva sesión limpia.
- **Firma al pie:** Toda respuesta concluye con:
  `turno N/15 · fase: [DIAGNOSTICAR | EJECUTAR | VERIFICAR] · ítem: <ID>`

---

## 2. El bus de mensajes y cola de tareas: `./ciclo/`

```
./ciclo/
├── ARRANQUE.md          ← Protocolo inicial de agentes.
├── ARRANQUE-ARQUITECTO.md ← Protocolo del Arquitecto (§2 obligatorio).
├── ESTADO.md            ← Estado vivo acotado (≤40 líneas).
├── COLA.md              ← Cola de tareas asíncrona por estados.
├── ORDEN.md             ← Orden/Especificación activa.
├── BITACORA.md          ← Registro de eventos append-only.
├── entregas/            ← Entregas estructuradas de implementadores.
└── veredictos/          ← Veredictos de QA (Hornet).
```

---

## 3. El Pipeline Automático de Tareas

1. **Arquitecto:** Genera la especificación de la tarea en `./ciclo/COLA.md`.
2. **Cuestionador (Red Teaming):** Evalúa y prueba falsabilidad. Pasa la tarea a `[PENDIENTE]`.
3. **Implementadores (`Edward` / `Alphonse`):** Toman la tarea `[PENDIENTE]`, desarrollan y la mueven a `[EN_VERIFICACION]`.
4. **Verificador (`Hornet` / QA):** Prueba ejecutable:
   - **Pasa:** Tarea marcada `[COMPLETADO]`.
   - **Falla de código:** Regresa a `[PENDIENTE]`.
   - **Falla de especificación:** Marcada `[REVISAR_ESPEC]` para re-evaluación del Arquitecto.
   - **Evaluación cualitativa:** Hornet convoca a `Rohan` (UX) o `Robin` (Fuentes) para certificar.
5. **Auditoría del Arquitecto y Consolidación:** Se genera `./ops/REVISION-HUMANO.md` para el Líder Humano.
