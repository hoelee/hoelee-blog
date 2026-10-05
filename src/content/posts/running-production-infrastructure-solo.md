---
title: "Running Production Infrastructure Solo: 162 Containers Across Three Hosts"
description: "One operator, three hosts, 162 containers in 78 compose stacks — Traefik, SSO, monitoring, mail, CI/CD and backups — and the two failures that changed how I verify my own numbers."
pubDate: 2026-10-06
category: case-studies
tags: [docker, traefik, monitoring, self-hosting, infrastructure, devops]
draft: true
---

## Why this matters

A business that sells software needs two things at once: an application that
does the job, and the machinery underneath that keeps it reachable, backed
up and secure. Agencies usually split those two between a developer and a
hosting company, which is how you end up with a developer who cannot see the
server and a hosting company that cannot read the code.

I run both. That means the person who wrote the application is also the
person who gets woken up when TLS renewal stops working, and who can fix the
application rather than blame the platform.

This is my own production footprint: three self-managed Docker hosts running
162 containers across 78 compose stacks, serving live public services —
client websites, a mail platform, CI/CD, workflow automation, analytics and
this blog. No cloud platform holds it together, and no team operates it.
Here is the architecture, and the two failures that changed how I check my
own work.

## The shape of it

| Host | What it carries | Containers | Compose stacks |
|---|---|---|---|
| Synology DSM | storage, SSO, the bulk of internal services | 86 | 44 |
| unRaid | CI runner, media pipeline, monitoring | 37 | 21 |
| Ubuntu 24.04 VPS | public entry point, mail platform, client sites | 39 | 13 |

The split is deliberate rather than historical. The VPS carries what must
stay reachable and fast when the home connection is not, because that is
where public traffic and client mail land. The Synology carries what needs
disk and a stable filesystem, plus the identity provider that every other
service trusts. unRaid runs the CI runner and the heavy, spiky batch work
that would otherwise compete with the services for RAM.

## What makes three hosts one system

**One ingress pattern.** Each host runs a Traefik reverse proxy with automated ACME TLS, so certificates renew themselves and no service owns a certificate file. Behind it there is one convention for routing and redirects, and Cloudflare sits in front of the public names.

**One identity provider.** authentik handles SSO with OIDC and proxy providers, so a new internal service is a new application in one place instead of a new password in a spreadsheet. Public services stay anonymous; everything else authenticates through it.

**One monitoring stack.** Prometheus, Grafana, cAdvisor and node-exporter across the hosts, in a single Grafana rather than three dashboards, because the interesting failures are the ones that cross host boundaries.

**One delivery path.** Self-hosted Gitea Action runners build and deploy. This blog ships through that pipeline — commit, runner picks it up, container rebuilds, Cloudflare serves the new build.

**Backups that are tested rather than assumed.** Snapshot-based backup on the NAS plus Duplicati and restic jobs, with restore procedures written down, because an untested backup is a feeling, not a backup.

## Failure 1: the dashboard was lying to me

When I built the monitoring stack I trusted what Grafana showed me, and
three of the panels were wrong.

cAdvisor reported "containers" that were really cgroup pseudo-entries, which
inflated the container count. My total-storage panel counted one NAS volume
three times, because three near-identical mount points were being scraped as
separate filesystems — the number looked plausible, which is exactly what
made it dangerous. And one virtual machine exported no CPU frequency at all,
so its panel stayed empty and I read that as "no data yet" instead of "this
exporter is misconfigured".

None of those broke a service. All three would have made me report something
false to a client, because a wrong number on a dashboard is
indistinguishable from a right one. I wrote the whole thing up in
[One Prometheus for unRaid, a Synology NAS, and a VPS](https://blog.hoelee.com/posts/one-prometheus-for-unraid-synology-and-a-vps/).

## Failure 2: one missing config file, three failure modes

Passbolt, my team password manager, started returning 504s and its cron job
appeared to hang. It turned out to be three separate failure modes with one
root cause: a configuration value that existed inside the running container
but never in the compose file.

A null GPG fingerprint stalled mail delivery, and because the mail send sat
inside the scheduled job, the whole job hung and took the UI with it. The
fix worked — until the container was recreated, which wiped it and restored
the original symptom, so the problem appeared to come back on its own. Then
`ssl.force` behind a reverse proxy produced a redirect loop that I had
introduced myself while chasing the other two.

Three symptoms, three sessions, one lesson: configuration that is not in
version control is not configuration. The full sequence is in
[Passbolt UI Kept Hanging — Three Failure Modes From One Missing Config File](https://blog.hoelee.com/posts/passbolt-hang-three-failure-modes/).

## How I keep the numbers honest

Numbers on a CV go stale quietly. Mine are re-derivable: a small script
reads the live Docker endpoints through the Portainer API and counts
containers and compose stacks per host, so "162 containers across 78+
compose stacks" is re-measured on demand rather than remembered from the day
it was true. The same script prints the list of services that must never
appear in anything client-facing.

The rule behind it is simple. A number that cannot be re-checked becomes a
claim nobody can defend — in an interview, in a proposal, or on a call when
a client asks how you got it. If I cannot re-measure a figure, it does not
go in the document.

## What I would do differently

**Every configuration value in the compose file from day one**, including the ones that feel like secrets of the machine rather than of the service. The Passbolt relapse existed only because a fix lived in a container.

**Alert on the absence of data, not just on bad data.** A blank panel and a healthy service look identical on a dashboard. If nothing arrives from an exporter for ten minutes, that is the alert.

**Measure availability with something built to measure availability.** A metrics pipeline tells you how a system is behaving; it does not count successful requests against total requests. If a percentage is going to appear in front of a client, it needs a probe checking endpoints on a schedule and recording the result — otherwise the honest answer is "monitored", not a number. That distinction matters more than the number.

## The result

Three hosts, 162 containers, 78 compose stacks, one operator — with
automated TLS, central SSO, cross-host monitoring, tested backups and
self-hosted CI/CD. It has run client websites, a mail platform, a Telegram
support bot, scheduling automation and this blog at the same time, and it is
the reason I can take a project from "here is the requirement" to "it is
live, monitored and backed up" without handing the second half to somebody
else.

## Want this for your business?

If you need someone who can build the application **and** run the
infrastructure it lives on — Docker and Traefik, automated TLS, SSO,
monitoring, mail, backups, CI/CD — I do exactly this, and I would rather
talk about your setup than send a brochure.

- WhatsApp: [wa.me/60127972969](https://wa.me/60127972969)
- Email: [me@hoelee.com](mailto:me@hoelee.com?subject=Infrastructure%20setup%20enquiry)
- More: [hoelee.com](https://hoelee.com)
