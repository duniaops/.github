# Dependency and Node.js security

DuniaOps uses GitHub Free. Do not enable paid features or trials. Every update
requires human review before merge. No third-party update app is required.

## Scope and ownership

- Enable dependency graph, Dependabot alerts and security updates for every active
  repository and as the defaults for new repositories. Keep security-only npm,
  pub, Swift, Deno and GitHub Actions configurations appropriate to each repo.
- Dependabot also checks official Node Docker images daily in container repos.
  Major upgrades remain separate migration work. Automatic merge is not enabled.
- The reusable `node-runtime.yml` workflow checks Node declarations against the
  official release index and support schedule. It rejects supported-line versions
  below the latest security release, end-of-life lines, and conflicting exact
  versions. It checks `.nvmrc`, `.node-version`, Node Docker stages, Netlify
  `NODE_VERSION` and literal `actions/setup-node` version inputs. Engine ranges
  are compatibility declarations rather than evidence of the installed runtime.
- Node checks run daily, on relevant PRs and on demand in consumer repositories.
  Their logs remain in the calling repository; private inventories are not
  published in this public repository. Network/data errors fail visibly.

The check reports a problem; it does not rewrite files or create runtime-file
PRs. Dependabot can update Docker references, but matching `.nvmrc`, CI and Netlify
changes may still need a maintainer. No Node check proves the deployed runtime.
Pin a supported full Node version in `.nvmrc`; point CI to that file. Match Docker
and Netlify versions and verify the actual runtime after rebuilding/deploying.
Floating major selectors require fresh builds and runtime verification.

## Rollout and future repositories

Review and merge this shared workflow first, then the consumer PRs. Consumer CI
cannot resolve the reusable workflow from `main` before that first merge.
Consumer PRs remain drafts where validation is incomplete. No PR is merged by
this rollout. The Actions template offers the same check for new Node repos;
select it when creating the repo. Organization security defaults do not install
workflow files automatically. Repositories without Node declarations need no
Node job. Archived repositories stay archived and are excluded from updates.

## Free organization defaults

`scripts/configure-free-security.py` audits settings by default. Explicit
`--apply` configures only free dependency security for all active and new repos.
The configuration product flag `advanced_security` must be `disabled`; paid
scanner settings remain `not_set`. The GitHub UI can create a configuration with
that product flag enabled even when scanners are “Not set”, causing attachment
to private repositories to fail with “Not purchased”. Do not purchase a license
to work around this. Use an organization-owner CLI session with the API rights
you choose; classic tokens require `admin:org`. Never print or commit tokens.

```sh
python3 scripts/configure-free-security.py
python3 scripts/configure-free-security.py --apply
```

The second command is an owner action when the current CLI lacks these rights.
Application is asynchronous; rerun the audit and verify every active repository
is attached. Also check transferred repositories; creation defaults alone may
not cover them. Review audit output locally, not in a public workflow.

## Triage and costs

Assign an owner to each alert/PR. Aim to assess critical alerts within 24 hours
and plan high fixes within seven days. Determine production exposure, including
build tools and transitive dependencies. Alert counts are not exploitability
evidence. Investigate failed jobs and stale PRs instead of dismissing alerts.

Dependabot is free. Standard-runner jobs in public repos are free; consumer
workflows in private repos use the organization's included Actions allowance.
Keep the existing Actions budget at $0 with paid usage blocked. Daily checks
use a single short Linux job with a five-minute timeout, install no packages and
upload no artifacts. If included quota runs out, checks may wait or fail until
reset; do not increase the budget. Do not add larger runners, Code Security,
Secret Protection, premium auto-triage or paid update apps under this policy.

References: [security features](https://docs.github.com/en/code-security/getting-started/github-security-features),
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[Node releases](https://nodejs.org/dist/index.json),
[Node support schedule](https://github.com/nodejs/Release/blob/main/schedule.json).
