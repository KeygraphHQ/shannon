# Third-Party Notices

Shannon incorporates and adapts material from third-party open-source projects.

Shannon as a whole is distributed under the GNU Affero General Public License,
version 3.0 (see LICENSE). Third-party material incorporated into Shannon
remains subject to the attribution and notice requirements of its own license.

## Mantis

Portions of Shannon's Capella agentic SAST implementation, specifically the
agent prompts, are derived from the Mantis project.

- Project:         https://github.com/google/mantis
- Upstream commit: 876a0c8c6b92c92f34e0041b7dbbc0e4cccddc52
- Retrieved:       2026-08-25
- License:         Apache License, Version 2.0

The Apache License, Version 2.0 is reproduced at LICENSES/Apache-2.0.txt.

The Mantis-derived files are individually marked with a provenance header and
reside under:

- apps/worker/prompts/partials/      (capella-*.hbs prompt partials)
- apps/worker/prompts/sast/capella/  (prompt templates)

The pinned upstream tree contains no NOTICE file, so no upstream NOTICE text is
reproduced here. The upstream LICENSE carries no copyright notice of its own, so
none is reproduced.

The Mantis-derived material has been substantially modified by Keygraph for
Shannon. Material changes include adaptation to Shannon's agent architecture,
enforcing repository-relative paths and complete verdict sets, and providing
separate production and pipeline-testing prompt variants.

Modifications: Copyright © 2026 Keygraph, Inc.
