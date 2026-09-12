# M1 — Deep Search Vertical Slice (offline)

Implementación de `ciclo/ORDEN-005.md` conforme a DU-001 y RFC-006.

## Comando de verificación

```bash
npm test           # suite completa (unitarias + integración)
npm run e2e        # corre el pipeline offline y escribe la evidencia
npm run verify:m1  # aceptación oficial M1 (lista explícita de suites)
```

El pipeline offline corre con fixtures deterministas (sin red):

```bash
node --experimental-strip-types src/cli.ts --offline \
  --out evidence/deep-search-e2e.json
```

Genera `evidence/deep-search-e2e.json` con las etapas `source`, `signal`,
`verification` y `opportunity`.

## Contrato de adquisición

Existe un único contrato `ISourceAdapter` en `src/adapters/ISourceAdapter.ts`:

```ts
interface ISourceAdapter {
  canHandle(urlOrSource: string): boolean;
  acquire(urlOrSource: string): Promise<NormalizedContent>;
}
```

`src/interfaces/ISourceAdapter.ts` (con `connect/fetchData/disconnect`) fue
eliminado; ya no existe una segunda semántica de adquisición.

## SDK de MCP: no instalable -> transporte inyectable + fake

El SDK oficial `@modelcontextprotocol/sdk` **no está instalado** en este
repositorio y la ruta de aceptación no tiene acceso a red para instalarlo.

Decisión (documentada conforme a ORDEN-005 §2.8):

- `McpClientService` ya no importa el SDK de forma estática. Expone un
  contrato `McpTransport` inyectable y solo intenta cargar el SDK oficial de
  forma dinámica (`import()`) cuando se usa un transporte real.
- `McpAgentReachAdapter` consume `McpClientService`; si MCP no está disponible,
  degrada a un **fixture determinista** documentado
  (`createAgentReachFixture`). Nunca usa aleatoriedad.
- `FirecrawlAdapter` acepta un `FirecrawlTransport` inyectable; sin transporte
  configurado degrada a `createFirecrawlFixture`.

Con esto, la aceptación M1 pasa sin red, sin SDK y sin APIs de pago.

## Verificación de claims (Odysseus)

`ClaimVerifier`:

- `MAX_ITERATIONS = 3` estricto (nunca se supera, ni por constructor).
- Evidencia provista por un `ClaimSearchProvider` inyectable (sin
  aleatoriedad).
- Veredictos por claim: `VERIFIED`, `REFUTED`, `UNVERIFIED_AMBIGUOUS`.
- Sin resolución tras 3 ciclos -> `UNVERIFIED_AMBIGUOUS`, con `penalty`
  aplicada al `EditorialScorer`.

`DeterministicEvidenceProvider` (en `src/services/EvidenceProviders.ts`) es el
fake determinista usado por `npm run e2e`.
