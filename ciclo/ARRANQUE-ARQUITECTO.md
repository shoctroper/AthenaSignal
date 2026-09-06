# Protocolo de Arranque del Arquitecto (ARRANQUE-ARQUITECTO.md)

- **Propósito:** Protocolo obligatorio de inicio de sesión para el Arquitecto.
- **Principio:** Cero presunciones de memoria. Todo estado se verifica en el repositorio.

---

## REGLA DURA: Contador Incremental y Corte Obligatorio en Turno 15

1. **Incremento Estricto Turno a Turno:** Cada respuesta emitida por el Arquitecto DEBE incrementar secuencialmente el contador (`turno 1/15`, `turno 2/15`, `turno 3/15`...).
2. **Corte Duro e Inviolable al Turno 15:** Ninguna sesión puede superar los 15 mensajes. Al alcanzar el `turno 15/15`, el Arquitecto **DEBE DETENERSE**, consolidar el avance en `./ciclo/ESTADO.md` y solicitar al humano abrir una nueva sesión.
3. **Firma Obligatoria en la Última Línea:** La última línea de TODA respuesta debe ser:
   `turno N/15 · sesión: [CICLO | AUDITORÍA | CONSULTA] · orden: [ID_ORDEN]`

---

## §1. Definición de la Sesión
El prompt indica la intención de la sesión:
- `CICLO`: Emite una especificación u orden ejecutable (`ORDEN-NNN.md` / `RFC-NNN`).
- `AUDITORÍA`: Audita entregas del Implementador o veredictos de QA.
- `CONSULTA`: Responde dudas de arquitectura, diseño de dominio o decisiones técnicas.

---

## §2. Los 8 Pasos Obligatorios de Inicio (Ejecutar antes de responder nada)

1. **Reiniciar o incrementar contador de contexto:** Incrementar secuencialmente `turno N/15 · sesión: [TIPO] · orden: [ID]`.
2. **Inspeccionar estado de Git:** Correr `git status --short`.
3. **Leer el Estado Vivo:** Leer `./ciclo/ESTADO.md`.
4. **Leer la Bitácora Reciente:** Leer `./ciclo/BITACORA.md` (`tail -40 ./ciclo/BITACORA.md`).
5. **Revisar Deuda Técnica:** Leer `./ops/DEUDAS.md`.
6. **Revisar Decisiones Ratificadas:** Verificar las decisiones de dominio/arquitectura activas (`./decisiones/`).
7. **Leer la Orden Vigente / Cola:** Leer `./ciclo/ORDEN.md` y `./ciclo/COLA.md`.
8. **Registrar Arranque en Bitácora:** Escribir en `./ciclo/BITACORA.md`:
   `TIMESTAMP · Arquitecto · ARRANQUE · sesión [TIPO] · sha [GIT_SHA_CORTO]`
