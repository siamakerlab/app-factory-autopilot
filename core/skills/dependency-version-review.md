---
name: dependency-version-review
description: Reviews dependency versions from official documentation and approves only latest stable compatible releases
kind: process
uses_agents: [dependency-version-manager]
---

# dependency-version-review

1. Invoke Dependency Version Manager for each pending Dependency Request.
2. The agent must verify latest stable version and compatibility from official
   documentation, including Kotlin, AGP, Gradle, JDK, SDK, and Compose BOM. Use
   this lookup order: mobile docs MCP, context7 when installed, then direct
   official web pages.
3. For Gradle itself, use `scripts/resolve-gradle-version.mjs` to read official
   `https://services.gradle.org/versions/current` metadata and fill wrapper
   version plus distribution SHA-256. The cache preserves confirmed results only;
   it is not a fallback reason when official verification fails.
4. User-facing Gradle messages should frame the update as confirmed latest
   stable progress, for example: "The latest stable version has been updated to
   <version>. Downloading it and continuing." Never say an older cached version
   is being used because the latest version is unavailable.
5. Non-stable versions fail automatically unless approved through
   `approval_request`.
6. Register migration work for `DEPENDENCY_MIGRATIONS.md` when required.
