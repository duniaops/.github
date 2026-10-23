#!/usr/bin/env python3
"""Audit or explicitly apply free dependency security settings using GitHub CLI."""

import argparse
import json
import subprocess

ORG = "duniaops"
NAME = "DuniaOps free dependency security"


def api(path, method="GET", payload=None, paginate=False):
    command = ["gh", "api", path, "--method", method]
    if paginate:
        command += ["--paginate", "--slurp"]
    if payload is not None:
        command += ["--input", "-"]
    result = subprocess.run(
        command,
        input=json.dumps(payload) if payload is not None else None,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write free settings")
    args = parser.parse_args()
    organization = api(f"orgs/{ORG}")
    if organization.get("plan", {}).get("name") != "free":
        raise SystemExit("Expected GitHub Free; review billing before proceeding.")
    repositories = [
        repo
        for page in api(f"orgs/{ORG}/repos?type=all&per_page=100", paginate=True)
        for repo in page
        if not repo["archived"]
    ]
    configurations = api(f"orgs/{ORG}/code-security/configurations")
    matches = [item for item in configurations if item["name"] == NAME]
    if len(matches) > 1:
        raise SystemExit("Multiple matching configurations; review before writing.")
    configuration = matches[0] if matches else None
    if args.apply:
        payload = {
            "name": NAME,
            "description": "Free dependency graph and Dependabot only; human review before merge.",
            "advanced_security": "disabled",
            "dependency_graph": "enabled",
            "dependabot_alerts": "enabled",
            "dependabot_security_updates": "enabled",
            "dependency_graph_autosubmit_action": "not_set",
            "code_scanning_default_setup": "not_set",
            "secret_scanning": "not_set",
            "secret_scanning_push_protection": "not_set",
            "secret_scanning_validity_checks": "not_set",
            "secret_scanning_non_provider_patterns": "not_set",
            "secret_scanning_generic_secrets": "not_set",
            "private_vulnerability_reporting": "not_set",
            "enforcement": "unenforced",
        }
        path = f"orgs/{ORG}/code-security/configurations"
        if configuration:
            path += f"/{configuration['id']}"
        configuration = api(path, "PATCH" if configuration else "POST", payload)
        configuration_id = configuration["id"]
        api(
            f"orgs/{ORG}/code-security/configurations/{configuration_id}/defaults",
            "PUT",
            {"default_for_new_repos": "all"},
        )
        api(
            f"orgs/{ORG}/code-security/configurations/{configuration_id}/attach",
            "POST",
            {
                "scope": "selected",
                "selected_repository_ids": [repo["id"] for repo in repositories],
            },
        )
        print("Application requested; attachment is asynchronous. Re-run this audit.")
    defaults = api(f"orgs/{ORG}/code-security/configurations/defaults")
    report = {
        "plan": "free",
        "active_repositories": len(repositories),
        "configuration": configuration,
        "defaults": defaults,
    }
    if configuration:
        attachments = api(
            f"orgs/{ORG}/code-security/configurations/{configuration['id']}/repositories?per_page=100",
            paginate=True,
        )
        report["attachments"] = [
            {"repository": item["repository"]["full_name"], "status": item["status"]}
            for page in attachments
            for item in page
        ]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
