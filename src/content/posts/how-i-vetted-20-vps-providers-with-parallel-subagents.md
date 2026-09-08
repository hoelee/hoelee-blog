---
title: "How I Vetted 20 VPS Providers in Three Hours with Parallel Subagents"
description: "A case study in orchestrating parallel AI subagents to run due diligence on 20 hosting providers — WHOIS, AUP, and reputation checks — collapsing a multi-hour research task into a structured, verifiable vendor scorecard."
pubDate: 2026-09-09
category: case-studies
tags: [ai-orchestration, subagents, due-diligence, hosting, devops]
ogImage: /og/how-i-vetted-20-vps-providers-with-parallel-subagents.png
banner: /banners/how-i-vetted-20-vps-providers-with-parallel-subagents.png
---

## Why it matters

Choosing a hosting provider is a bet you place with a credit card and a DNS
change. Get it wrong and "guaranteed uptime" becomes a suspension email at 2 AM,
or "privacy-friendly" becomes a log-retention clause you never read.

The problem isn't a lack of information — it's that the information is scattered
across a dozen pages per provider (WHOIS records, acceptable-use policies,
privacy policies, pricing pages, and third-party review sites), and checking them
manually is slow, boring, and error-prone. One provider is five tabs. Twenty
providers is a hundred tabs and an afternoon you don't get back.

This is the story of how I collapsed that afternoon into about three hours — not
by working faster, but by orchestrating a small team of AI subagents to run the
boring part in parallel, and scoring everything against one checklist.

## The problem: verifying claims I couldn't take on faith

I needed to shortlist providers for a project with hard requirements: specific
jurisdictions, payment methods, and traffic terms. None of those are written
honestly on a homepage. They're written honestly in the boring documents — the
WHOIS record that shows a domain is four months old, the AUP that quietly bans
the exact service you wanted to run, the privacy policy that admits to log
retention.

The hard part is that verifying one provider means reading five documents that
disagree with each other. The marketing says "since 2012"; the WHOIS says "this
April." The features page says "all traffic allowed"; the AUP says "Tor relays
prohibited." One provider is a fact-checking exercise. Twenty is a research
project.

## What I tried first: one agent, one big loop

My first instinct was the obvious one — a single assistant that works through the
list, provider by provider, fetching each document, taking notes, moving on.

It worked. It was also the wrong tool for the shape of the job. The work is
*embarrassingly parallel*: provider #7's WHOIS lookup has nothing to do with
provider #3's privacy policy. Running them one after another meant the total time
was the sum of every fetch, and — more importantly — the context window filled
with half-finished notes from providers I'd already moved past. By provider
eight or nine, early findings were getting crowded out by later ones.

The lesson: a task that's a flat loop over independent items isn't a reasoning
problem, it's a fan-out problem. One long context is the wrong container for it.

## The fix: fan out with parallel subagents, then score once

The structure that worked was three layers:

**1. A checklist that doesn't care which provider it's pointed at.** Before
spawning anything, I wrote down exactly what "verified" means per provider:

- domain registration date vs. the "since" claim
- acceptable-use policy, searched for the specific service I cared about
- privacy policy, read for the retention clause
- third-party reputation (Trustpilot trend, not average; community mentions)
- traffic terms ("unmetered" vs. a metered cap)

That checklist was the contract. Every subagent got the same one, plus a list of
providers to run it against.

**2. Parallel subagents, one per batch of providers.** I split the pool into
clusters and handed each cluster to its own subagent. Each one worked in
isolation, with its own context and its own set of fetches, and returned a
structured fact sheet per provider — not a paragraph, but fields I could drop
straight into a scorecard.

The key here is that the subagents don't know about each other. That's the
point: nothing from provider #1 has to share context space with provider #14.
Each returns a self-contained result.

**3. A single scoring pass, done by me, not delegated.** The subagents produced
findings; I did the judgment. The moment you let a subagent both *gather* the
facts and *rank* the providers, you lose the audit trail — you get a verdict
without the evidence behind it. Keeping scoring central means I can always say
*why* something ranked where it did, and point at the exact WHOIS record or AUP
line that drove it.

This mirrors a pattern I'd use for any code review or refactor: parallelize the
mechanical collection, centralize the decisions.

### What the orchestration actually looked like

Roughly, per batch:

```text
subagent → "here's the checklist, here are your 5 providers"
         → per provider: fetch WHOIS, AUP, privacy policy, pricing, reviews
         → return { domain_age, aup_flags[], retention, reputations, traffic }
me → merge into one scorecard, apply the checklist, rank, write up
```

Three subagents ran side by side. The whole pass — twenty providers, five
documents each, one hundred-ish fetches — landed in the time it would have taken
me to do two or three providers carefully by hand.

## What the verification actually caught

The scorecard surfaced real problems that a homepage never would have:

- **A provider whose "trusted since 2012" claim was younger than the domain.**
  WHOIS said the domain was registered that same year — a four-figure "years in
  business" claim on a domain months old. That's either a re-branded shell or a
  lie, and either way it downgraded every other claim on the page in my eyes.

- **Two providers whose AUP banned the exact service I wanted to run.** One
  listed "TOR nodes" and "anonymizing services" in its prohibited-activity
  clause; another banned "reverse proxies" and "tunnels." Both still advertised
  the opposite on their features pages. Ten minutes of `Ctrl-F` on the AUP is all
  it took to rule them out — but only once I *knew to check the AUP* instead of
  the features page.

- **A provider that looked cheap until I read the traffic terms.** "Unlimited" on
  a plan with a metered 1 TB cap is marketing. For a relay that both receives and
  forwards traffic, the real cost doubles — the "cheap" option wasn't.

The pattern across all of them: the disqualifying information was never hidden.
It was *public*, sitting in a document the provider is legally required to
publish. The skill isn't secret access — it's knowing which document to read and
checking it against the marketing.

## What I'd do differently

The subagent hand-off worked, but it was blunt. Next time I'd give each subagent
the *exact* fields to return up front — a strict output schema — rather than a
prose summary I then have to re-parse. Structured output means the scorecard is
built by the time the last subagent returns, with no re-reading.

I'd also pin the "is this claim independently verifiable?" test earlier. Most of
the red flags weren't a provider lying outright; they were a claim I couldn't
check against any public record. Treat "unverifiable" as its own signal, and the
shortlist shrinks fast.

## The result

~20 providers audited across ~100 document fetches, three subagents running in
parallel, in the time a careful manual pass would have spent on two providers.
Every ranking in the final scorecard traces back to a specific public record —
a WHOIS date, an AUP line, a retention clause — not a vibe.

---

## Want this for your business?

Choosing a vendor is the same shape of problem whether it's a VPS, an API
gateway, or a payroll provider: verify the claims you're relying on *before* you
sign, against public records that can't be edited by marketing. If you've got a
shortlist of vendors or tools and you want a structured, evidence-backed
evaluation before you commit — I can run the due-diligence pass and hand you a
scorecard, not a hunch.

[WhatsApp me](https://wa.me/60127972969) or [email me](mailto:me@hoelee.com?subject=Vendor%20due-diligence%20evaluation) at hoelee.com — I help businesses pick the right infrastructure and build the automation around it.