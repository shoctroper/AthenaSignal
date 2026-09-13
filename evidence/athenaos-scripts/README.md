# AthenaSignal → AthenaOS — real script generation (MGV-FLEET-6)

**Result: 12/12 scripts pass the engine's automatic review** (Approved, Fidelidad 1.00, Findings 0).

## Method (real pipeline, no mocks)
- Inputs: AKP knowledge banks (`~/.athena/banco/<topic>/known-facts`, 40–84 KnownFacts each), i.e. the AthenaSignal→AKP→AthenaOS chain.
- Generator: AthenaOS engine `athena run --topic ... --knowledge ...` (AthenaFramework `athena.dll`).
- Provider: `deepseek-v4-flash` via OpenCode Go OpenAI-compatible endpoint (`https://opencode.ai/zen/go/v1`).
- Evaluation: engine `EditorialFidelityScore` / QualityReview (deterministic), plus claim-attribution coverage.
- Each script carries a case UUID, provider/model, knowledge provenance and the referenced claims.

## Per-script results

| bank | case | facts | claims | review | fidelity | findings |
|---|---|---|---|---|---|---|
| adn-franklin | `9f4461ae-4e77-4ee3-a82a-6f8cfb14b7cc` | 52 | 50 | Approved | 1.0 | 0 |
| alejandria | `5672c5bd-e1ee-458e-a5c2-f6dfa5f0945a` | 47 | 47 | Approved | 1.0 | 0 |
| apollo-13 | `92f9ec2c-7af2-4239-8e3a-801fdf80180b` | 48 | 45 | Approved | 1.0 | 0 |
| chernobil | `39a284ab-2af0-44dd-85f1-6ae273cb7661` | 45 | 44 | Approved | 1.0 | 0 |
| contenedor-carga | `afd95eca-0f8e-4dce-8964-f11090d5a06b` | 45 | 45 | Approved | 1.0 | 0 |
| curie-radio | `31aa81f6-3029-4a14-8b68-6de925dc3859` | 45 | 42 | Approved | 1.0 | 0 |
| enigma-bletchley | `0bcf6436-2e67-4fd1-a638-2b6dcf0af4eb` | 45 | 44 | Approved | 1.0 | 0 |
| hambruna-irlandesa | `eb8bd2c0-86d3-417b-91e2-239fda4a41c3` | 44 | 43 | Approved | 1.0 | 0 |
| imprenta-rich | `36367000-d9ad-4fbf-8ead-457db747e6fa` | 40 | 39 | Approved | 1.0 | 0 |
| juicio-nuremberg | `5d6682e8-34e5-4b58-8c1a-104915b3249a` | 47 | 47 | Approved | 1.0 | 0 |
| muro-berlin | `997d7659-e488-4a6f-a4bb-b1ce842145d1` | 45 | 44 | Approved | 1.0 | 0 |
| peste-rich | `05a7de0e-e6f3-4563-bd9d-2ed622441b8c` | 52 | 52 | Approved | 1.0 | 0 |

## Adversarial finding (honest quality caveat)
- The deterministic fidelity evaluator verifies **source/claim fidelity** (no invented/disputed-lost claims), which all 12 satisfy.
- It does **not** enforce narrative structure: drafts are fact-order concatenations rather than editorially structured pieces.
- Therefore 12/12 is a **necessary-but-not-sufficient** result: it proves the real pipeline runs, evaluates and produces claim-grounded drafts, but the evaluator must be strengthened before claiming 'usable scripts'.

## Reproduce
```
ATHENA_LLM_PROVIDER=deepseek ATHENA_LLM_MODEL=deepseek-v4-flash \
ATHENA_LLM_BASE_URL=https://opencode.ai/zen/go/v1 ATHENA_LLM_API_KEY=<opencode-go> \
dotnet athena.dll run --topic "<topic>" --knowledge <bank>/known-facts
```
