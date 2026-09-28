---
title: "I Let an Agent Manage My Shopee Vouchers — And It Created One I Never Approved"
description: "Vouchers have no draft state: Confirm means live and drawing on escrow. Here is the audit → propose → auto design I use to keep an agent away from that button, and the list-lag mistake that cost me an unplanned voucher."
pubDate: 2025-07-08
updatedDate: 2026-09-29
category: ai
tags: [ai-agent, shopee, automation, human-in-the-loop, ecommerce, cron]
ogImage: /og/i-let-an-agent-manage-my-shopee-vouchers.png
banner: /banners/i-let-an-agent-manage-my-shopee-vouchers.png
draft: false
---

I run a small digital-goods shop on Shopee. The shop is young, and the thing standing between it and its first sale is not stock — it is a programme application that stays stuck until the shop has at least one completed order in 30 days. So orders first.

Vouchers are the cheapest lever I have for that: digital goods have near-zero marginal cost, so a RM6 discount costs me RM6 only when somebody actually buys, instead of nothing at all. Fine. I also already had an agent driving the Shopee Seller Centre over the Chrome DevTools Protocol for listings, so automating vouchers looked like a small extension of work I had already done.

It wasn't small. Not because the automation was hard, but because of one property of the platform:

**A Shopee voucher has no draft state.** For a product listing you can click *Save and Delist*, walk away, and decide later. For a voucher, `Confirm` is the publish button and the spend button at the same time — the moment you click it, buyers can claim it and every claim draws on your escrow balance. There is no “saved, not live” middle position to hide in.

That single sentence drove the entire design, and it is the part I would get right first if I did it again.

## What the platform actually does (all of this I learned by testing)

Four rules, each of which I discovered the hard way:

1. **No draft state.** Confirmed above. Editing an existing voucher means loading its edit form and clicking `Confirm` again, which re-saves it — it does not create a second one, but there is still no “stage it, then publish” step.
2. **One New Buyer (“shop welcome”) voucher per shop, hard.** Trying to create a second one fails with a toast: *“Please create a new shop welcome voucher after the existing one is expired.”* The click registers, the URL never changes, and there is no red text next to any field — which matters, see the next section.
3. **Shop vouchers are not limited that way.** Three coexisting Shop Vouchers worked fine. So “one voucher per type” is the wrong generalisation; the welcome voucher is the special case.
4. **Once a voucher is `Ongoing`, its economics lock.** The edit form renders the discount amount, minimum spend, and start date as `disabled`. Only the name, code suffix, end date, and quantity stay editable. And there is **no delete control anywhere** — not on the list, not on the edit page. A live voucher can only be edited or left to expire.

Rule 4 is the one that reshapes strategy: you cannot “fix” a live discount. You can only let it die and replace it. Which means the decision to create a voucher is much less reversible than it looks.

## The three-tier design

I did not want to give an agent a spending button, and I also did not want to babysit vouchers by hand. What I settled on is three layers that differ in *who makes the decision*:

| Layer | What it does | Who decides |
|---|---|---|
| **A — audit** | Read-only: list vouchers, flag expiring/exhausted/no-claims, report one line | nobody, it is automated |
| **B — semi-auto** | Reports a problem; a human replies with one line; the agent performs the edit | the human |
| **C — propose** | Computes the exact voucher it *would* create — amount, minimum spend, quantity, window, exposure — and stops | the human, on the price |

Layer A is a cron job: every morning at 09:00 a script drives the browser, reads the voucher list, and prints a digest. It exits `2` when the browser/CDP endpoint is unreachable or the session is logged out, and `3` when the page does not parse — so silence never means success.

Layer C is where the interesting engineering is. The policy lives in a JSON file, not in code, and each voucher type is a **slot**:

```json
{
  "enabled": true,
  "mode": "propose",
  "replenish": {
    "templates": [
      {
        "slot": "new_buyer",
        "type": "new_buyer",
        "name": "New Buyer RM9.60 off min RM18",
        "amount": 9.6, "min_spend": 18, "qty": 20,
        "window_days": 14, "code_prefix": "NB",
        "max_per_7_days": 1
      }
    ]
  },
  "caps": { "monthly_exposure_rm": 300 }
}
```

The agent evaluates one question: *is any slot empty?* If yes, it works out the parameters and — in `propose` mode — prints them and stops:

```
PROPOSAL (nothing created yet): slot 'new_buyer' is empty → 9.6 off / Min RM18 / 20 qty
  / 14 days, code NBX4K, exposure RM192
  why: no live voucher in slot 'new_buyer'
WAITING FOR PRICE CONFIRMATION before creating (policy mode=propose)
```

The create path only executes when the policy says `"mode": "auto"` **and** the run is not a dry run:

```python
mode = str(pol.get("mode") or "propose").lower()
if a.dry or mode != "auto":
    print_proposal(actions)      # never touches the platform
else:
    apply_auto(actions)          # the one code path that can spend money
```

That is the whole trick, and it is unglamorous: **one boolean between you and the button**, defaulting to “ask”. Everything else — caps, slots, digests — is supporting cast.

## The mistake: a list that lied by being ten minutes old

Here is the part I would rather not write, because it cost money and it was pure impatience.

I filled a voucher form, clicked `Confirm`, and read the result the way you read any web form: URL changed? No. Success toast? No. Red error text? None. So I asked the script for the voucher list. The voucher was not in it.

Conclusion I drew: the create was silently refused — presumably another per-type limit like the welcome-voucher one, just without the courtesy of an error message. So I clicked `Confirm` again. And again.

The voucher **had** been created. The list was ten minutes behind. It appeared later, `Ongoing`, at my intended RM14 off / minimum spend RM29 — a voucher I never meant to create, whose worst-case exposure is RM140 if all ten claims are redeemed.

Three lessons, in order of how much they cost me:

1. **“No visible change” is not “failure”. It is “unknown”.** A write over a UI has three possible states — landed, refused, or not yet reflected — and two of those look identical at first glance.
2. **Build the idempotency guard before the write path, not after.** Ask the list whether a matching voucher exists, create once, wait, re-read. Since then every create in this project starts with a “does this already exist?” read.
3. **Never re-click a submit you have not verified.** My script reported `Confirm: clicked @926,619` — a true statement about a mouse event and a useless statement about the world. A click log is not an outcome.

I now treat the post-write read as authoritative and everything else as noise, with a minimum wait before I am allowed to conclude anything.

## What I'd do differently

- **Start in propose mode.** I initially shipped the auto layer switched on, with exposure caps as the guardrail. Caps limit the *size* of a mistake; propose mode prevents the mistake. The cap-based design felt safer to build and was strictly worse to live with.
- **Design for slot emptiness, not “shop has no vouchers”.** Because of rule 2, “is there a voucher?” is the wrong question; “is *this type* of voucher present?” is the right one, and it is what makes automatic replenishment correct.
- **Make every write assert its own postcondition.** Right now the create path is verified by a separate audit run. It should verify itself and fail loudly if the read-back does not match the intent.
- **Log intent before acting.** “I am about to create RM9.60/18 × 20, exposure RM192” in the same output as the action would have made my duplicated attempt obvious in the logs the moment it happened, instead of one audit later.

## The result

Four vouchers are live right now, and together they form a price ladder by basket size — which was the actual commercial goal:

| Basket | Discount | Buyer pays |
|---|---|---|
| RM9 (one item) | RM6 off | **RM3** |
| RM18 (two items) | RM9.20 off | **RM8.80** |
| RM29 | RM14 off | **RM15** |
| New buyers | RM4.50 off | **RM4.50** |

Worst-case exposure if every single claim is redeemed: RM474. Real exposure is a fraction of that, because it is only charged on completed orders — with one exception: the RM140 voucher I created by accident, which I am leaving up because it happens to be the RM29 rung I wanted anyway.

Since the propose gate went in, the agent has created **zero** vouchers on its own. What it does instead is print a paragraph once a day, and wait for me to say yes.

## Want this for your business?

The pattern — an agent that monitors, computes, and *stops on its own* at the one action that costs money — is the part worth copying, and it applies well beyond Shopee: ad budgets, refund approvals, supplier orders, anything with a spend call in it. I build automation like this on top of the tools you already run — Shopee or WooCommerce, Docker and Traefik on your own boxes, n8n, and Telegram for the reporting.

Message me on [WhatsApp](https://wa.me/60127972969) or email [me@hoelee.com](mailto:me@hoelee.com?subject=Agent%20automation%20for%20my%20business) — tell me where you would want the agent to stop and ask, and I will tell you honestly whether that is a weekend job or a bad idea. More at [hoelee.com](https://hoelee.com).
