# Cutting a release

A release is an annotated git tag `vX.Y.Z` on `main` whose version matches
`package.json`. Pushing the tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which re-runs the gate and publishes a GitHub Release. The release body is
**not** auto-generated. Write it first.

The body format follows the
[cardano-stake-pool-operator-scripts](https://github.com/devhalls/cardano-stake-pool-operator-scripts)
releases: a one-line product sentence, fixed headed lists, then a support
badge. See [`releases/v0.2.0.md`](releases/v0.2.0.md) for a filled example.

## Before you tag

1. Bump `package.json` (and the lockfile) to `X.Y.Z`.
2. Update the install pin in `README.md` and `ROADMAP.md` to `#vX.Y.Z`.
3. Write `docs/releases/vX.Y.Z.md` from the template below. The workflow
   refuses to publish if that file is missing.
4. Commit. Tag-line only: `[UPD] Bump package version to X.Y.Z`.
5. Push `main`. Then:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --tags
```

The tag and `package.json` must agree. The workflow fails closed if they
do not, so a pin cannot land on a build that misreports its version.

## Body template

Copy this into `docs/releases/vX.Y.Z.md`. Keep the heading names. Drop
**Changes since** only on a first tag that has no previous release.

```markdown
Search Console and GA4 analytics CLI. <one line on what this tag is> for vX.Y.Z.

**Min version support:**
- Node.js **22.12.0**

**Requires:**
- A Google service account with Restricted / Viewer access to Search Console and/or GA4

**Runtime support:**
- macOS
- Linux

**Changes since vA.B.C:**
- <user-visible change>
- <user-visible change>

**Support us:**

If you find this useful, visit Pendulum:

[![Pendulum][Pendulum-shield]][Pendulum-url]

[Pendulum-shield]: https://img.shields.io/badge/pendulum-000000?style=for-the-badge
[Pendulum-url]: https://pendulumdev.co.uk/
```

Rules:

- Opening line is `{what it is}. {what this tag is} for vX.Y.Z.`
- ASCII hyphens only. No em dash or en dash.
- Changes are user-visible. Do not list commit hashes or chore-only lockfile noise.
- The Pendulum badge at the end is required. Reference-style image links are fine
  in a GitHub Release body.
- Do not pass `--generate-notes`. The workflow publishes this file as the body.

## Version bumps

`0.x` minors are for a new capability or a floor that drops a previously
supported runtime. Patches are fixes and docs that do not change the
`run.json` contract. A change to that contract, `analytics.toml` keys, or
`src/index.ts` exports is a breaking change - say so in the opening line.
