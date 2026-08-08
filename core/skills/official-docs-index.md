---
name: official-docs-index
description: Basic official documentation index for libraries, release information, and deprecated APIs
kind: process
---

# official-docs-index

1. Collect libraries currently used or planned from the Version Catalog and
   roadmap.
2. Check official documentation and official release information for each
   library. Use mobile docs MCP first, context7 when installed, then direct
   official web pages. If those fail, do not use blogs, StackOverflow, or
   unofficial posts as evidence. Record unresolved sources as unverified.
3. Update `DOCS_INDEX.md` with library name, official documentation URL, latest
   stable version, deprecated APIs, and migration requirements.
4. Advanced document caching, compatibility matrices, and automatic deprecated
   API detection are MVP-2 scope.
