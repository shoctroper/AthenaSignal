# Protocolo de Arranque General para Agentes (ARRANQUE.md)

Todo agente (Coordinador, Implementador, Verificador, Documentalista, Editor) debe ejecutar este protocolo al iniciar su turno:

1. **Leer Estado Vivo:** `cat ./ciclo/ESTADO.md`
2. **Leer la Orden / Bloque Asignado:** `cat ./ciclo/ORDEN.md` (o el bloque asignado).
3. **Leer Ficha de Rol:** Leer su contrato operativo en `./agentes/<TU-FICHA>.md`.
4. **Leer Deudas:** `cat ./ops/DEUDAS.md` (para evitar fallos conocidos).
5. **Registrar en Bitácora:** Escribir en `./ciclo/BITACORA.md`:
   `TIMESTAMP · <TuNombre> · ARRANQUE · orden <ID_ORDEN> · ficha <VERSION> · sha <HASH>`
