---
name: API code generation exports
description: Orval's Zod body aliases can collide with its separately generated TypeScript models.
---

When regenerating API contracts, keep Zod schema value/type exports unambiguous in the package barrel; do not fix collisions by editing generated files.

**Why:** Orval's split Zod output can emit a body schema and same-named inferred type while its TypeScript model output exports another same-named body type. Re-exporting both with only star exports produces TS2308.

**How to apply:** Prefer the schema module explicitly for duplicated body names, retaining other generated model exports. Run the shared-library type check after code generation.
